# Test User Utility

This utility creates test users with different roles and permissions for testing the authentication and authorization system.

## Available Test Users

The utility creates the following users:

### Regular Users
- Email: `user@test.com`
- Role: user

### Admin Users
- Email: `admin@test.com`
- Role: admin

### Super Admin Users
- Email: `superadmin@test.com`
- Role: superadmin

### Manager Role
- Email: `manager@test.com`
- Role: manager

### Viewer Role
- Email: `viewer@test.com`
- Role: viewer

### Editor Role
- Email: `editor@test.com`
- Role: editor

### User with Collaborators
- **Main User**
  - Email: `teamowner@test.com`
  - Role: user
- **Collaborators**
  - Viewer Collaborator
    - Email: `collab-viewer@test.com`
    - Role: viewer
  - Manager Collaborator
    - Email: `collab-manager@test.com`
    - Role: manager

## Password

All users (including collaborators) have the same password:

```
Test123!
```

## How to Use

1. Make sure your MongoDB connection string is correctly set up in your `.env` file
2. Run the following command from the project root:

```bash
npm run create-test-users
```

## Testing Collaborator Login

To test collaborator login, you can use:

1. Login with `collab-viewer@test.com` / `Test123!` to test viewer collaborator permissions
2. Login with `collab-manager@test.com` / `Test123!` to test manager collaborator permissions

These collaborator users are associated with the `teamowner@test.com` account.

## Next Steps

After creating the test users, you can:

1. Login to the application using any of the test user credentials
2. Navigate to the `/role-test` page to check if role detection is working correctly
3. Test different features with different user permissions

## Clean Up

To remove all test users from the database, run the utility again. It will delete existing test users before creating new ones. 