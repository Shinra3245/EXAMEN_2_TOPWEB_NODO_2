module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599 ? err.status : 500;
  console.error(`[ERROR] ${status} ${err.message}`);
  if (req.originalUrl.startsWith('/api')) {
    return res.status(status).json({ error: err.message });
  }
  res.status(status).render('error', { titulo: 'Error', mensaje: err.message, status });
};
