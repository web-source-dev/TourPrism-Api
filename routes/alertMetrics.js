import express from "express";
import Alert from "../models/Alert.js";
import TimeTracking from "../models/timetracking.js";
import { authenticate, authenticateRole } from "../middleware/auth.js";

const router = express.Router();

/**
 * Get per-alert metrics with performance scoring
 * Calculates: total_views, total_follows, follow_rate, performance_score, performance_status
 */
router.get("/performance", authenticateRole(['admin', 'manager', 'viewer', 'editor']), async (req, res) => {
  try {
    const { page = 1, limit = 20, sortBy = 'performance_score', sortOrder = 'desc', status } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build status filter based on the status parameter
    let statusFilter = { status: { $in: ['approved', 'pending'] } };
    if (status === 'published') {
      statusFilter = { status: 'approved' };
    } else if (status === 'archived') {
      statusFilter = { status: 'archived' };
    }
    
    // Get alerts with their basic metrics based on status filter
    const alerts = await Alert.find(statusFilter)
      .select('_id title viewCount numberOfFollows addToEmailSummary createdAt')
      .lean();
    
    // Calculate average time spent on feed for all users
    const avgTimeOnFeed = await TimeTracking.aggregate([
      {
        $group: {
          _id: null,
          avgTimeSpent: { $avg: '$timeSpent' }
        }
      }
    ]);
    
    const avgTimeOnFeedValue = avgTimeOnFeed[0]?.avgTimeSpent || 0;
    
    // Calculate metrics for each alert
    const alertsWithMetrics = alerts.map(alert => {
      const totalViews = alert.viewCount || 0;
      const totalFollows = alert.numberOfFollows || 0;
      const followRate = totalViews > 0 ? (totalFollows / totalViews) * 100 : 0;
      const pushedToForecast = alert.addToEmailSummary ? 10 : 0;
      
      // Calculate performance score
      const performanceScore = Math.round(
        (totalFollows * 3) + 
        (totalViews * 1) + 
        (avgTimeOnFeedValue / 2) + 
        pushedToForecast
      );
      
      return {
        _id: alert._id,
        title: alert.title,
        total_views: totalViews,
        total_follows: totalFollows,
        follow_rate: Math.round(followRate * 100) / 100, // Round to 2 decimal places
        performance_score: performanceScore,
        pushed_to_forecast: alert.addToEmailSummary,
        created_at: alert.createdAt
      };
    });
    
    // Sort by the specified field
    alertsWithMetrics.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      
      if (sortOrder === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });
    
    // Calculate performance status based on performance score percentiles
    const scores = alertsWithMetrics.map(alert => alert.performance_score).sort((a, b) => a - b);
    const totalAlerts = scores.length;
    
    if (totalAlerts > 0) {
      const top25Index = Math.floor(totalAlerts * 0.75);
      const bottom25Index = Math.floor(totalAlerts * 0.25);
      
      const top25Threshold = scores[top25Index];
      const bottom25Threshold = scores[bottom25Index];
      
      alertsWithMetrics.forEach(alert => {
        if (alert.performance_score >= top25Threshold) {
          alert.performance_status = 'Overperforming';
        } else if (alert.performance_score <= bottom25Threshold) {
          alert.performance_status = '❄ Underperforming';
        } else {
          alert.performance_status = 'Normal';
        }
      });
    }
    
    // Apply pagination
    const paginatedAlerts = alertsWithMetrics.slice(skip, skip + parseInt(limit));
    
    // Calculate summary statistics
    const totalViews = alertsWithMetrics.reduce((sum, alert) => sum + alert.total_views, 0);
    const totalFollows = alertsWithMetrics.reduce((sum, alert) => sum + alert.total_follows, 0);
    const avgFollowRate = totalViews > 0 ? (totalFollows / totalViews) * 100 : 0;
    const avgPerformanceScore = alertsWithMetrics.length > 0 
      ? alertsWithMetrics.reduce((sum, alert) => sum + alert.performance_score, 0) / alertsWithMetrics.length 
      : 0;
    
    const performanceDistribution = {
      overperforming: alertsWithMetrics.filter(alert => alert.performance_status === 'Overperforming').length,
      normal: alertsWithMetrics.filter(alert => alert.performance_status === 'Normal').length,
      underperforming: alertsWithMetrics.filter(alert => alert.performance_status === '❄ Underperforming').length
    };
    
    res.json({
      alerts: paginatedAlerts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: alertsWithMetrics.length,
        totalPages: Math.ceil(alertsWithMetrics.length / parseInt(limit))
      },
      summary: {
        total_alerts: alertsWithMetrics.length,
        total_views: totalViews,
        total_follows: totalFollows,
        avg_follow_rate: Math.round(avgFollowRate * 100) / 100,
        avg_performance_score: Math.round(avgPerformanceScore),
        performance_distribution: performanceDistribution
      }
    });
    
  } catch (error) {
    console.error('Error fetching alert performance metrics:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * Get top performing alerts
 */
router.get("/top-performers", authenticateRole(['admin', 'manager', 'viewer', 'editor']), async (req, res) => {
  try {
    const { limit = 10, metric = 'performance_score', status } = req.query;
    
    // Build status filter based on the status parameter
    let statusFilter = { status: { $in: ['approved', 'pending'] } };
    if (status === 'published') {
      statusFilter = { status: 'approved' };
    } else if (status === 'archived') {
      statusFilter = { status: 'archived' };
    }
    
    // Get alerts with their basic metrics based on status filter
    const alerts = await Alert.find(statusFilter)
      .select('_id title viewCount numberOfFollows addToEmailSummary createdAt')
      .lean();
    
    // Calculate average time spent on feed
    const avgTimeOnFeed = await TimeTracking.aggregate([
      {
        $group: {
          _id: null,
          avgTimeSpent: { $avg: '$timeSpent' }
        }
      }
    ]);
    
    const avgTimeOnFeedValue = avgTimeOnFeed[0]?.avgTimeSpent || 0;
    
    // Calculate metrics for each alert
    const alertsWithMetrics = alerts.map(alert => {
      const totalViews = alert.viewCount || 0;
      const totalFollows = alert.numberOfFollows || 0;
      const followRate = totalViews > 0 ? (totalFollows / totalViews) * 100 : 0;
      const pushedToForecast = alert.addToEmailSummary ? 10 : 0;
      const performanceScore = Math.round(
        (totalFollows * 3) + 
        (totalViews * 1) + 
        (avgTimeOnFeedValue / 2) + 
        pushedToForecast
      );
      
      return {
        _id: alert._id,
        title: alert.title,
        total_views: totalViews,
        total_follows: totalFollows,
        follow_rate: Math.round(followRate * 100) / 100,
        performance_score: performanceScore,
        pushed_to_forecast: alert.addToEmailSummary,
        created_at: alert.createdAt
      };
    });
    
    // Sort by the specified metric
    alertsWithMetrics.sort((a, b) => b[metric] - a[metric]);
    
    // Return top performers
    const topPerformers = alertsWithMetrics.slice(0, parseInt(limit));
    
    res.json({
      top_performers: topPerformers,
      metric: metric,
      total_alerts_analyzed: alertsWithMetrics.length
    });
    
  } catch (error) {
    console.error('Error fetching top performers:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * Get performance comparison between alerts
 */
router.get("/comparison/:alertId1/:alertId2", authenticateRole(['admin', 'manager', 'viewer', 'editor']), async (req, res) => {
  try {
    const { alertId1, alertId2 } = req.params;
    
    const [alert1, alert2] = await Promise.all([
      Alert.findById(alertId1).select('_id title viewCount numberOfFollows addToEmailSummary createdAt').lean(),
      Alert.findById(alertId2).select('_id title viewCount numberOfFollows addToEmailSummary createdAt').lean()
    ]);
    
    if (!alert1 || !alert2) {
      return res.status(404).json({ message: 'One or both alerts not found' });
    }
    
    // Calculate average time spent on feed
    const avgTimeOnFeed = await TimeTracking.aggregate([
      {
        $group: {
          _id: null,
          avgTimeSpent: { $avg: '$timeSpent' }
        }
      }
    ]);
    
    const avgTimeOnFeedValue = avgTimeOnFeed[0]?.avgTimeSpent || 0;
    
    // Calculate metrics for both alerts
    const calculateMetrics = (alert) => {
      const totalViews = alert.viewCount || 0;
      const totalFollows = alert.numberOfFollows || 0;
      const followRate = totalViews > 0 ? (totalFollows / totalViews) * 100 : 0;
      const pushedToForecast = alert.addToEmailSummary ? 10 : 0;
      const performanceScore = Math.round(
        (totalFollows * 3) + 
        (totalViews * 1) + 
        (avgTimeOnFeedValue / 2) + 
        pushedToForecast
      );
      
      return {
        total_views: totalViews,
        total_follows: totalFollows,
        follow_rate: Math.round(followRate * 100) / 100,
        performance_score: performanceScore,
        pushed_to_forecast: alert.addToEmailSummary
      };
    };
    
    const metrics1 = calculateMetrics(alert1);
    const metrics2 = calculateMetrics(alert2);
    
    // Calculate differences
    const differences = {
      views_diff: metrics1.total_views - metrics2.total_views,
      follows_diff: metrics1.total_follows - metrics2.total_follows,
      follow_rate_diff: metrics1.follow_rate - metrics2.follow_rate,
      performance_score_diff: metrics1.performance_score - metrics2.performance_score
    };
    
    res.json({
      alert1: {
        _id: alert1._id,
        title: alert1.title,
        metrics: metrics1,
        created_at: alert1.createdAt
      },
      alert2: {
        _id: alert2._id,
        title: alert2.title,
        metrics: metrics2,
        created_at: alert2.createdAt
      },
      comparison: {
        differences,
        better_performer: metrics1.performance_score > metrics2.performance_score ? 'alert1' : 'alert2',
        performance_gap: Math.abs(differences.performance_score_diff)
      }
    });
    
  } catch (error) {
    console.error('Error comparing alert metrics:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * Get detailed metrics for a specific alert
 */
router.get("/:alertId", authenticateRole(['admin', 'manager', 'viewer', 'editor']), async (req, res) => {
  try {
    const { alertId } = req.params;
    
    const alert = await Alert.findById(alertId)
      .select('_id title viewCount numberOfFollows addToEmailSummary createdAt')
      .lean();
    
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }
    
    // Calculate average time spent on feed
    const avgTimeOnFeed = await TimeTracking.aggregate([
      {
        $group: {
          _id: null,
          avgTimeSpent: { $avg: '$timeSpent' }
        }
      }
    ]);
    
    const avgTimeOnFeedValue = avgTimeOnFeed[0]?.avgTimeSpent || 0;
    
    // Calculate metrics
    const totalViews = alert.viewCount || 0;
    const totalFollows = alert.numberOfFollows || 0;
    const followRate = totalViews > 0 ? (totalFollows / totalViews) * 100 : 0;
    const pushedToForecast = alert.addToEmailSummary ? 10 : 0;
    
    // Calculate performance score
    const performanceScore = Math.round(
      (totalFollows * 3) + 
      (totalViews * 1) + 
      (avgTimeOnFeedValue / 2) + 
      pushedToForecast
    );
    
    // Get all alerts to calculate percentiles
    const allAlerts = await Alert.find({ status: { $in: ['approved', 'pending'] } })
      .select('viewCount numberOfFollows addToEmailSummary')
      .lean();
    
    const allScores = allAlerts.map(a => {
      const views = a.viewCount || 0;
      const follows = a.numberOfFollows || 0;
      const forecast = a.addToEmailSummary ? 10 : 0;
      return Math.round((follows * 3) + (views * 1) + (avgTimeOnFeedValue / 2) + forecast);
    }).sort((a, b) => a - b);
    
    const totalAlerts = allScores.length;
    let performanceStatus = 'Normal';
    
    if (totalAlerts > 0) {
      const top25Index = Math.floor(totalAlerts * 0.75);
      const bottom25Index = Math.floor(totalAlerts * 0.25);
      
      const top25Threshold = allScores[top25Index];
      const bottom25Threshold = allScores[bottom25Index];
      
      if (performanceScore >= top25Threshold) {
        performanceStatus = 'Overperforming';
      } else if (performanceScore <= bottom25Threshold) {
        performanceStatus = '❄ Underperforming';
      }
    }
    
    // Calculate percentile rank
    const percentileRank = totalAlerts > 0 
      ? Math.round((allScores.filter(score => score < performanceScore).length / totalAlerts) * 100)
      : 0;
    
    res.json({
      alert_id: alert._id,
      title: alert.title,
      metrics: {
        total_views: totalViews,
        total_follows: totalFollows,
        follow_rate: Math.round(followRate * 100) / 100,
        performance_score: performanceScore,
        performance_status: performanceStatus,
        percentile_rank: percentileRank,
        pushed_to_forecast: alert.addToEmailSummary
      },
      score_breakdown: {
        follows_component: totalFollows * 3,
        views_component: totalViews * 1,
        time_component: Math.round(avgTimeOnFeedValue / 2),
        forecast_component: pushedToForecast
      },
      created_at: alert.createdAt
    });
    
  } catch (error) {
    console.error('Error fetching alert metrics:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
