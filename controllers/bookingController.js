const Booking = require('../models/Booking.js');
const Logger = require('../utils/logger.js');
const csv = require('csv-parser');
const { Readable } = require('stream');
const mongoose = require('mongoose');

/**
 * Upload and parse CSV file containing bookings
 */
const uploadBookings = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { buffer, originalname } = req.file;
    const hotelId = req.userId;


    const bookings = [];
    const errors = [];
    let processedCount = 0;

    // Parse CSV
    const stream = Readable.from(buffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv({
          mapHeaders: ({ header, index }) => {
            // Handle CSV by position since headers might vary
            // Expected format: Booking ID, Guest First Name, Guest Email, Room Type, Booking Date, Check-in Date, Check-out Date, Total Nights, Booking Rate, Total Amount, Booking Source
            const positionMappings = {
              0: 'bookingId',      // Booking ID
              1: 'guestFirstName', // Guest First Name
              2: 'guestEmail',     // Guest Email (optional)
              3: 'roomType',       // Room Type
              4: 'bookingDate',    // Booking Date (optional, will be ignored)
              5: 'checkInDate',    // Check-in Date
              6: 'checkOutDate',   // Check-out Date (optional, will be ignored)
              7: 'nights',         // Total Nights
              8: 'bookingRate',    // Booking Rate
              9: 'totalAmount',    // Total Amount (optional, will be ignored)
              10: 'bookingSource'  // Booking Source
            };

            // Try header-based mapping first
            const normalized = header.toLowerCase().trim();
            const headerMappings = {
              'booking id': 'bookingId',
              'booking_id': 'bookingId',
              'guest first name': 'guestFirstName',
              'guest_first_name': 'guestFirstName',
              'guest email': 'guestEmail',
              'guest_email': 'guestEmail',
              'room type': 'roomType',
              'room_type': 'roomType',
              'booking date': 'bookingDate',
              'booking_date': 'bookingDate',
              'check-in date': 'checkInDate',
              'check_in_date': 'checkInDate',
              'checkin date': 'checkInDate',
              'checkin_date': 'checkInDate',
              'check-out date': 'checkOutDate',
              'check_out_date': 'checkOutDate',
              'checkout date': 'checkOutDate',
              'checkout_date': 'checkOutDate',
              'total nights': 'nights',
              'total_nights': 'nights',
              'booking rate': 'bookingRate',
              'booking_rate': 'bookingRate',
              'total amount': 'totalAmount',
              'total_amount': 'totalAmount',
              'booking source': 'bookingSource',
              'booking_source': 'bookingSource'
            };

            return headerMappings[normalized] || positionMappings[index] || normalized;
          }
        }))
        .on('data', (row) => {
          processedCount++;

          try {
            // Validate required fields (Email, Room Type and Booking Source are optional)
            const requiredFields = ['bookingId', 'guestFirstName', 'checkInDate', 'nights', 'bookingRate'];

            for (const field of requiredFields) {
              if (!row[field] || row[field].toString().trim() === '') {
                errors.push({
                  row: processedCount,
                  field,
                  message: `Missing required field: ${field}`
                });
                return; // Skip this row
              }
            }

            // Parse and validate data
            const bookingData = {
              hotelId,
              bookingId: row.bookingId.toString().trim(),
              guestFirstName: row.guestFirstName.toString().trim(),
              guestEmail: row.guestEmail && row.guestEmail.toString().trim() ? row.guestEmail.toString().trim().toLowerCase() : undefined,
              checkInDate: new Date(row.checkInDate),
              nights: parseInt(row.nights),
              bookingRate: parseFloat(row.bookingRate.toString().replace(/[£$,]/g, '')),
              roomType: row.roomType ? row.roomType.toString().trim() : 'Standard',
              bookingSource: row.bookingSource ? row.bookingSource.toString().trim() : 'Direct'
            };

            // Validate data types
            if (isNaN(bookingData.checkInDate.getTime())) {
              errors.push({
                row: processedCount,
                field: 'checkInDate',
                message: 'Invalid date format. Use YYYY-MM-DD format.'
              });
              return;
            }

            if (isNaN(bookingData.nights) || bookingData.nights <= 0) {
              errors.push({
                row: processedCount,
                field: 'nights',
                message: 'Nights must be a positive number'
              });
              return;
            }

            if (isNaN(bookingData.bookingRate) || bookingData.bookingRate < 0) {
              errors.push({
                row: processedCount,
                field: 'bookingRate',
                message: 'Booking rate must be a valid positive number'
              });
              return;
            }

            bookings.push(bookingData);

          } catch (error) {
            errors.push({
              row: processedCount,
              message: `Error processing row: ${error.message}`
            });
          }
        })
        .on('end', () => {
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });

    // If there are too many errors, don't save anything
    if (errors.length > Math.min(bookings.length * 0.1, 10)) {
      return res.status(400).json({
        success: false,
        message: 'Too many errors in CSV file. Please fix the errors and try again.',
        errors: errors.slice(0, 20), // Show first 20 errors
        totalErrors: errors.length
      });
    }

    // Save bookings to database
    if (bookings.length > 0) {
      const savedBookings = await Booking.insertMany(bookings, { ordered: false });

      await Logger.log(req, 'bookings_upload', {
        fileName: originalname,
        totalRows: processedCount,
        successfulBookings: savedBookings.length,
        errors: errors.length
      });

      return res.status(200).json({
        success: true,
        message: `Successfully uploaded ${savedBookings.length} bookings`,
        data: {
          totalProcessed: processedCount,
          successful: savedBookings.length,
          errors: errors.length
        },
        errors: errors.slice(0, 10) // Show first 10 errors for reference
      });
    }

    return res.status(200).json({
      success: true,
      message: 'No valid bookings found in CSV file',
      data: {
        totalProcessed: processedCount,
        successful: 0,
        errors: errors.length
      },
      errors
    });

  } catch (error) {
    console.error('Error uploading bookings:', error);

    await Logger.log(req, 'bookings_upload_error', {
      error: error.message
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to process CSV file',
      error: error.message
    });
  }
};

/**
 * Get bookings for the authenticated hotel
 */
const getBookings = async (req, res) => {
  try {
    const hotelId = req.userId;
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      sortBy = 'checkInDate',
      sortOrder = 'asc'
    } = req.query;

    const query = { hotelId };

    // Add date range filter
    if (startDate || endDate) {
      query.checkInDate = {};
      if (startDate) query.checkInDate.$gte = new Date(startDate);
      if (endDate) query.checkInDate.$lt = new Date(endDate);
    }

    // Build sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await Booking
      .find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Booking.countDocuments(query);

    await Logger.log(req, 'bookings_list', {
      page,
      limit,
      total,
      filters: query
    });

    return res.status(200).json({
      success: true,
      data: {
        bookings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error getting bookings:', error);

    await Logger.log(req, 'bookings_list_error', {
      error: error.message
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve bookings',
      error: error.message
    });
  }
};

/**
 * Get booking statistics for the hotel
 */
const getBookingStats = async (req, res) => {
  try {
    const hotelId = req.userId;
    const { startDate, endDate } = req.query;

    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.checkInDate = {};
      if (startDate) dateFilter.checkInDate.$gte = new Date(startDate);
      if (endDate) dateFilter.checkInDate.$lt = new Date(endDate);
    }

    const stats = await Booking.aggregate([
      {
        $match: {
          hotelId: new mongoose.Types.ObjectId(hotelId),
          ...dateFilter
        }
      },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: { $multiply: ['$bookingRate', '$nights'] } },
          avgRoomRate: { $avg: '$bookingRate' },
          avgNights: { $avg: '$nights' },
          totalNights: { $sum: '$nights' },
          bookingSources: {
            $addToSet: '$bookingSource'
          },
          roomTypes: {
            $addToSet: '$roomType'
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalBookings: 0,
      totalRevenue: 0,
      avgRoomRate: 0,
      avgNights: 0,
      totalNights: 0,
      bookingSources: [],
      roomTypes: []
    };

    await Logger.log(req, 'bookings_stats', {
      dateFilter,
      stats: result
    });

    return res.status(200).json({
      success: true,
      data: {
        overview: result
      }
    });

  } catch (error) {
    console.error('Error getting booking stats:', error);

    await Logger.log(req, 'bookings_stats_error', {
      error: error.message
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve booking statistics',
      error: error.message
    });
  }
};

/**
 * Update booking status
 */
const updateBookingStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const updateData = req.body;
    const hotelId = req.userId;

    // Remove fields that shouldn't be updated
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    const booking = await Booking.findOneAndUpdate(
      { _id: bookingId, hotelId },
      updateData,
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    await Logger.log(req, 'booking_update', {
      bookingId,
      updateData
    });

    return res.status(200).json({
      success: true,
      message: 'Booking updated successfully',
      data: booking
    });

  } catch (error) {
    console.error('Error updating booking:', error);

    await Logger.log(req, 'booking_update_error', {
      bookingId: req.params.bookingId,
      error: error.message
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to update booking',
      error: error.message
    });
  }
};

/**
 * Delete a booking
 */
const deleteBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const hotelId = req.userId;

    const booking = await Booking.findOneAndDelete({
      _id: bookingId,
      hotelId
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    await Logger.log(req, 'booking_delete', {
      bookingId
    });

    return res.status(200).json({
      success: true,
      message: 'Booking deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting booking:', error);

    await Logger.log(req, 'booking_delete_error', {
      bookingId: req.params.bookingId,
      error: error.message
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to delete booking',
      error: error.message
    });
  }
};

/**
 * Get bookings at risk for a specific alert
 */
const getBookingsAtRisk = async (req, res) => {
  try {
    const hotelId = req.userId;
    const { startDate, endDate } = req.query;

    const query = { hotelId };
    if (startDate || endDate) {
      query.checkInDate = {};
      if (startDate) query.checkInDate.$gte = new Date(startDate);
      if (endDate) query.checkInDate.$lte = new Date(endDate);
    }

    const bookings = await Booking.find(query).sort({ checkInDate: 1 });

    await Logger.log(req, 'bookings_at_risk', {
      startDate,
      endDate,
      count: bookings.length
    });

    return res.status(200).json({
      success: true,
      data: bookings
    });

  } catch (error) {
    console.error('Error getting bookings at risk:', error);

    await Logger.log(req, 'bookings_at_risk_error', {
      error: error.message
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to get bookings at risk',
      error: error.message
    });
  }
};

module.exports = {
  uploadBookings,
  getBookings,
  getBookingStats,
  updateBookingStatus,
  deleteBooking,
  getBookingsAtRisk
};

