import { InstitutionProfile } from '../models/InstitutionProfile.js';

export async function getProfile(req, res) {
  let profile = await InstitutionProfile.findOne({ createdBy: req.user._id });
  if (!profile) {
    // If not found, return empty profile structure
    return res.json({
      success: true,
      data: {
        institutionName: req.user.schoolInstitute || '',
        logoUrl: '',
        address: '',
        contactInfo: '',
        website: '',
        defaultHeader: '',
        defaultFooter: ''
      }
    });
  }
  res.json({ success: true, data: profile });
}

export async function upsertProfile(req, res) {
  const query = { createdBy: req.user._id };
  const update = {
    ...req.body,
    createdBy: req.user._id
  };
  const options = { new: true, upsert: true };
  const profile = await InstitutionProfile.findOneAndUpdate(query, update, options);
  res.json({ success: true, data: profile });
}
