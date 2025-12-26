const rolePermissions = {
  admin: {
    canManageUsers: true,
    canManageCourses: true,
    canManageContent: true,
    canManageGallery: true,
    canManageNews: true,
    canManageStudents: true,
    canViewAnalytics: true,
    canExportData: true
  },
  faculty: {
    canManageUsers: false,
    canManageCourses: false,
    canManageContent: true,
    canManageGallery: false,
    canManageNews: false,
    canManageStudents: true,
    canViewAnalytics: true,
    canExportData: false
  },
  student: {
    canManageUsers: false,
    canManageCourses: false,
    canManageContent: false,
    canManageGallery: false,
    canManageNews: false,
    canManageStudents: false,
    canViewAnalytics: false,
    canExportData: false
  }
};

const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const role = req.user.role;
    if (rolePermissions[role] && rolePermissions[role][permission]) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Insufficient permissions'
    });
  };
};

module.exports = { checkPermission, rolePermissions };