module.exports = (err, req, res, next) => {
  const status = err.status || 500;
  console.error(`[ERROR] ${status} ${err.message}`);
  if (req.originalUrl.startsWith('/api')) {
    return res.status(status).json({ error: err.message });
  }
  res.status(status).render('error', { titulo: 'Error', mensaje: err.message, status });
};
