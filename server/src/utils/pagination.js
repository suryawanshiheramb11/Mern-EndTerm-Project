export const paginate = ({ page, limit }) => ({ skip: (page - 1) * limit, limit });

export const pageMeta = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
});
