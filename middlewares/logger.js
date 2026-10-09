module.exports = (req, res, next) => {
  const inicio = Date.now();
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - inicio} ms)`);
  });
  next();
};
