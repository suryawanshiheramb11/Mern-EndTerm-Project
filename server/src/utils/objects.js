// Flatten nested plain objects into Mongo dot paths so a partial nested patch doesn't
// overwrite sibling fields: { address: { city: 'X' } } -> { 'address.city': 'X' }.
export const toDotPaths = (obj, prefix = '') =>
  Object.entries(obj).reduce((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(acc, toDotPaths(value, path));
    } else {
      acc[path] = value;
    }
    return acc;
  }, {});
