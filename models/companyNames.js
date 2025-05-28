import mongoose from 'mongoose';

const companyNamesSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  }
}, { timestamps: true });

// Add a case-insensitive text index for better search performance
companyNamesSchema.index({ name: 'text' });

// Pre-save hook to ensure name is always properly formatted
companyNamesSchema.pre('save', function(next) {
  // Ensure first letter is capitalized for consistency
  if (this.name && this.name.length > 0) {
    this.name = this.name.charAt(0).toUpperCase() + this.name.slice(1);
  }
  next();
});

const CompanyNames = mongoose.model('CompanyNames', companyNamesSchema);

export default CompanyNames;
