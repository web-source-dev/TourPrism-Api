# Database Migration Guide

This guide explains how to migrate your existing database data from the old schema to the new schema.

## ⚠️ IMPORTANT WARNINGS

1. **BACKUP YOUR DATA FIRST**: Always run the backup script before migration
2. **TEST IN DEVELOPMENT**: Run migration on a development database first
3. **REVIEW MIGRATED DATA**: Check that all data was migrated correctly
4. **IRREVERSIBLE**: This migration cannot be easily reversed

## Migration Overview

### What Changed

#### Alerts Model
- **Old Schema**: Complex location-based alerts with userId, origin/impact locations, media, likes, etc.
- **New Schema**: Simplified alerts focused on disruptions with mainType/subType categorization, confidence scoring, and impact calculations

#### Users Model
- **Old Schema**: Detailed company profiles with extensive categorization
- **New Schema**: Streamlined company info focused on hotel operations

### Key Mapping Changes

#### Alerts
- `description` → `summary`
- `expectedStart/expectedEnd` → `startDate/endDate`
- `alertCategory` → `mainType` (mapped to enum values)
- `alertType` → `subType` (mapped to enum values)
- `impact` → confidence score calculation
- `recommendedAction` → `recoveryExpected`
- Location data simplified to single `city` field

#### Users
- `firstName + lastName` → `company.contactName`
- Complex company fields → simplified hotel-focused fields
- Collaborator roles updated to new enum values
- Company size categories updated

## Migration Steps

### 1. Backup Your Data
```bash
cd Backend
npm run backup
```

This creates timestamped JSON files in `Backend/backups/` containing all your current data.

### 2. Run Migration
```bash
npm run migrate
```

The script will:
- Connect to your database
- Migrate all users first, then alerts
- Log progress for each record
- Show completion status

### 3. Verify Migration
After migration completes, check your application to ensure:
- Users can log in
- Alerts display correctly
- Admin panel works
- No data loss occurred

## Troubleshooting

### Migration Fails
- Check database connection
- Ensure MongoDB is running
- Verify environment variables

### Data Issues After Migration
- Restore from backup if needed
- Check migration logs for errors
- Manually fix any problematic records

### Restoring from Backup
If you need to restore data:
```bash
# Use MongoDB tools to restore from JSON files
mongoimport --db yourdb --collection users --file backups/users_backup_TIMESTAMP.json
mongoimport --db yourdb --collection alerts --file backups/alerts_backup_TIMESTAMP.json
```

## Post-Migration Tasks

1. **Update Application Code**: Ensure all frontend/backend code uses new model fields
2. **Update Admin Panel**: Verify CRUD operations work with new schema
3. **Test Features**: Check alert processing, user management, analytics
4. **Clean Up**: Remove old backup files after confirming migration success

## Support

If you encounter issues:
1. Check the migration logs for error details
2. Verify your data matches the expected old schema
3. Contact development team with specific error messages
