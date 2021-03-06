exports.schemaTypes = Object.freeze({
  ITEM: 'Item',
  DOCUMENT: 'Document',
  CAC: 'CACUser',
  PROJECT: 'Project',
  GROUP: 'Group',
  USER: 'User',
  RECENT_ACTIVITY: 'RecentActivity',
  INSPECTION: 'Inspection',
  INSPECTION_ELEMENT: 'InspectionElement',
  NOTIFICATION_PROJECT: 'NotificationProject',
  LIST: 'List',
  COMMENT: 'Comment',
  COMMENT_PERIOD: 'CommentPeriod',
  ORGANIZATION: 'Organization',
});

exports.MAX_FEATURE_DOCS = 5;

exports.PUBLIC_ROLES = ['public'];
exports.SECURE_ROLES = ['sysadmin', 'staff'];