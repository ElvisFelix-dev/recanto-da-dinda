let ioInstance = null

export function setSocketServer(io) {
  ioInstance = io
}

export function getSocketServer() {
  return ioInstance
}

export function emitToAdminRoles(roles, event, payload) {
  if (!ioInstance) return
  for (const role of roles) ioInstance.to(`role:${role}`).emit(event, payload)
}

export function emitToAdmin(adminId, event, payload) {
  if (!ioInstance || !adminId) return
  ioInstance.to(`admin:${adminId}`).emit(event, payload)
}
