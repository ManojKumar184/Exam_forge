import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Card, Button, Input, Alert, PageHeader } from '../../components/ui';

export function SettingsPage() {
  const { profile, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [school, setSchool] = useState(profile?.school_institute || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    const { error } = await updateProfile({
      full_name: fullName,
      school_institute: school,
      phone,
    });
    setIsSaving(false);
    if (error) {
      setMessage('Failed to update profile.');
    } else {
      setMessage('Profile updated successfully.');
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <PageHeader title="Settings" subtitle="Manage your account profile" />

      {message && (
        <Alert variant={message === 'Profile updated successfully.' ? 'success' : 'error'} title={message} />
      )}

      <div className="grid grid-cols-1 gap-6">
        <Card className="p-6 space-y-4">
          <h3 className="text-base font-bold text-slate-800 border-b pb-2">Profile Details</h3>
          <Input label="Email" value={profile?.email || ''} disabled />
          <Input
            label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Input
            label="School / Institute"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
          />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button onClick={handleSave} isLoading={isSaving}>
            Save changes
          </Button>
        </Card>

        {profile && (profile.role === 'super_admin' || profile.role === 'faculty') && (
          <Card className="p-6 space-y-4 border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 border-b pb-2">Institution Publishing Settings</h3>
            <p className="text-sm text-slate-500">
              Configure institutional branding, logos, website, and page layout/header/footer defaults for professional paper exports.
            </p>
            <Link to="/settings/institution">
              <Button variant="outline" className="w-full sm:w-auto">
                Manage Institution Profile
              </Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
