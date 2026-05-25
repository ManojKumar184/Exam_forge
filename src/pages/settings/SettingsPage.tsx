import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Card, Button, Input, Alert } from '../../components/ui';

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
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your account profile</p>
      </div>

      {message && (
        <Alert variant={message.includes('success') ? 'success' : 'error'} title={message} />
      )}

      <Card className="p-6 space-y-4">
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
    </div>
  );
}
