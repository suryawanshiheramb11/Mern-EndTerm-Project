// All money is stored as integer paise. The API accepts and returns rupees; conversion happens
// in the validator layer (inbound) and the serializers (outbound).
export const toPaise = (rupees) => Math.round(rupees * 100);

export const toRupees = (paise) => paise / 100;

export const paiseField = () => ({
  type: Number,
  min: 0,
  validate: { validator: Number.isInteger, message: '{PATH} must be an integer number of paise' },
});

export const isPaise = (value) => Number.isSafeInteger(value);

// Signed integer paise (adjustments, reversal entries). Floats are rejected, never rounded.
export const signedPaiseField = () => ({
  type: Number,
  validate: { validator: Number.isSafeInteger, message: '{PATH} must be an integer number of paise' },
});
