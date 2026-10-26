export const noStore = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

export default noStore;
