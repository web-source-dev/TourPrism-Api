import Booking from '../models/Booking.js';
import Logger from '../utils/logger.js';
import csv from 'csv-parser';
import { Readable } from 'stream';
import mongoose from 'mongoose';

/**
 * Upload and parse CSV file containing bookings
 */
export const uploadBookings = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { buffer, originalname } = req.file;
    const hotelId = req.userId;

    // Generate import batch ID
    const importBatch = `import_${Date.now()}_${hotelId}`;

    const bookings = [];
    const errors = [];
    let processedCount = 0;

    // Parse CSV
    const stream = Readable.from(buffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv({
          mapHeaders: ({ header }) => {
            // Normalize column headers
            const normalized = header.toLowerCase().trim();
            const mappings = {
              'booking id': 'bookingId',
              'booking_id': 'bookingId',
              'guest first name': 'guestFirstName',
              'guest_first_name': 'guestFirstName',
              'guest email': 'guestEmail',
              'guest_email': 'guestEmail',
              'check-in date': 'checkInDate',
              'check_in_date': 'checkInDate',
              'checkin date': 'checkInDate',
              'checkin_date': 'checkInDate',
              'nights': 'nights',
              'booking rate (£)': 'bookingRate',
              'booking rate': 'bookingRate',
              'booking_rate': 'bookingRate',
              'room type': 'roomType',
              'room_type': 'roomType',
              'booking source': 'bookingSource',
              'booking_source': 'bookingSource'
            };
            return mappings[normalized] || normalized;
          }
        }))
        .on('data', (row) => {
          processedCount++;

          try {
            // Validate required fields
            const requiredFields = ['bookingId', 'guestFirstName', 'guestEmail', 'checkInDate', 'nights', 'bookingRate', 'roomType', 'bookingSource'];

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
              guestEmail: row.guestEmail.toString().trim().toLowerCase(),
              checkInDate: new Date(row.checkInDate),
              nights: parseInt(row.nights),
              bookingRate: parseFloat(row.bookingRate.toString().replace(/[£$,]/g, '')),
              roomType: row.roomType.toString().trim(),
              bookingSource: row.bookingSource.toString().trim(),
              importBatch,
              importDate: new Date()
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
        importBatch,
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
          errors: errors.length,
          importBatch
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
export const getBookings = async (req, res) => {
  try {
    const hotelId = req.userId;
    const {
      page = 1,
      limit = 50,
      status = 'active',
      startDate,
      endDate,
      sortBy = 'checkInDate',
      sortOrder = 'asc'
    } = req.query;

    const query = { hotelId };

    // Add status filter
    if (status && status !== 'all') {
      query.status = status;
    }

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
      .populate('associatedAlerts.alertId', 'title mainType subType')
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
export const getBookingStats = async (req, res) => {
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
          hotelId: hotelId,
          status: 'active',
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

    const riskStats = await Booking.aggregate([
      {
        $match: {
          hotelId: hotelId,
          status: 'active',
          ...dateFilter
        }
      },
      {
        $group: {
          _id: '$riskLevel',
          count: { $sum: 1 },
          revenue: { $sum: { $multiply: ['$bookingRate', '$nights'] } }
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
        overview: result,
        riskBreakdown: riskStats
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
export const updateBookingStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status, riskLevel } = req.body;
    const hotelId = req.userId;

    const updateData = {};
    if (status) updateData.status = status;
    if (riskLevel) updateData.riskLevel = riskLevel;

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
export const deleteBooking = async (req, res) => {
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
export const getBookingsAtRisk = async (req, res) => {
  try {
    const hotelId = req.userId;
    const { alertId, startDate, endDate } = req.query;

    const bookings = await Booking.getBookingsAtRisk(hotelId, startDate, endDate, alertId);

    await Logger.log(req, 'bookings_at_risk', {
      alertId,
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

