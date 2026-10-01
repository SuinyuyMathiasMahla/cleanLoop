import React, { useEffect, useState } from 'react';
import { Plus, Trash2, AlertCircle, Phone, Mail, Clock, CheckSquare, Eye, EyeOff, MapPin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useCrewStore, CreateCrewInput } from '../store/crewStore';
import { StatusBadge } from '../components/common/StatusBadge';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/EmptyState';
import { TableSkeleton } from '../components/common/LoadingSpinner';

interface FormData {
  name: string;
  email: string;
  phone: string;
  location: string;
  locationLat: string;
  locationLng: string;
  temporaryPassword: string;
}

const EMPTY_FORM: FormData = { name: '', email: '', phone: '', location: '', locationLat: '', locationLng: '', temporaryPassword: '' };

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('409') || msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('usernameexists')) {
    return 'A crew member with this email address already exists.';
  }
  if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('forbidden')) {
    return 'You do not have permission to perform this action.';
  }
  if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
    return 'Something went wrong on our end. Please try again in a moment.';
  }
  if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('failed to fetch')) {
    return 'Unable to connect. Please check your internet connection and try again.';
  }
  if (msg.length < 120 && !msg.includes('at ') && !msg.includes('Exception') && !msg.includes('arn:aws')) {
    return msg;
  }
  return 'Failed to create crew member. Please check your inputs and try again.';
}

export function CrewPage() {
  const { crew, total, isLoading, error, fetchCrew, createCrew, updateLocation, deactivateCrew, clearError } = useCrewStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<FormData>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingMember, setEditingMember] = useState<(typeof crew)[number] | null>(null);
  const [locationDraft, setLocationDraft] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);

  useEffect(() => {
    fetchCrew();
  }, []);

  const validate = (): boolean => {
    const errs: Partial<FormData> = {};

    if (!form.name.trim()) {
      errs.name = 'Full name is required.';
    } else if (form.name.trim().length < 2) {
      errs.name = 'Name must be at least 2 characters.';
    }

    if (!form.email.trim()) {
      errs.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Please enter a valid email address (e.g. name@example.com).';
    }

    if (form.phone.trim()) {
      const cleaned = form.phone.replace(/[\s\-().]/g, '');
      if (!cleaned.startsWith('+')) {
        errs.phone = 'Phone number must include a country code starting with + (e.g. +27 82 000 0000).';
      } else if (!/^\+\d{7,15}$/.test(cleaned)) {
        errs.phone = 'Please enter a valid international phone number (e.g. +27 82 000 0000).';
      }
    }

    if (!form.location.trim()) {
      errs.location = 'A Buea location is required for automatic task assignment.';
    }
    if ((form.locationLat.trim() && !form.locationLng.trim()) || (!form.locationLat.trim() && form.locationLng.trim())) {
      errs.locationLat = 'Enter both latitude and longitude, or leave both blank to use geocoding.';
    }

    if (!form.temporaryPassword) {
      errs.temporaryPassword = 'A temporary password is required.';
    } else if (form.temporaryPassword.length < 8) {
      errs.temporaryPassword = 'Password must be at least 8 characters long.';
    } else if (!/[A-Z]/.test(form.temporaryPassword)) {
      errs.temporaryPassword = 'Password must contain at least one uppercase letter.';
    } else if (!/[0-9]/.test(form.temporaryPassword)) {
      errs.temporaryPassword = 'Password must contain at least one number.';
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const cleaned = form.phone.trim().replace(/[\s\-().]/g, '');
      const input: CreateCrewInput = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: cleaned || undefined,
        location: form.location.trim() || undefined,
        locationLat: form.locationLat.trim() ? Number(form.locationLat) : undefined,
        locationLng: form.locationLng.trim() ? Number(form.locationLng) : undefined,
        temporaryPassword: form.temporaryPassword,
      };
      await createCrew(input);
      setShowCreateModal(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setSubmitError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    setDeleting(true);
    try {
      await deactivateCrew(id);
      setConfirmDelete(null);
    } catch {
      // error handled in store
    } finally {
      setDeleting(false);
    }
  };

  const handleLocationUpdate = async () => {
    if (!editingMember || !locationDraft.trim()) {
      setLocationError('Enter a crew location in Buea.');
      return;
    }
    setSavingLocation(true);
    setLocationError(null);
    try {
      const latitude = form.locationLat.trim() ? Number(form.locationLat) : editingMember.locationLat ?? undefined;
      const longitude = form.locationLng.trim() ? Number(form.locationLng) : editingMember.locationLng ?? undefined;
      await updateLocation(editingMember.crewId, locationDraft.trim(), latitude, longitude);
      setEditingMember(null);
    } catch (err) {
      setLocationError(friendlyError(err));
    } finally {
      setSavingLocation(false);
    }
  };

  const f = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((p) => ({ ...p, [key]: e.target.value }));
    if (formErrors[key]) setFormErrors((p) => ({ ...p, [key]: undefined }));
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setSubmitError(null);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Crew</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} crew members</p>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => { clearError(); setShowCreateModal(true); }}
        >
          Add Crew Member
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Member</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Contact</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Location</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Active Tasks</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Last Login</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={7}><TableSkeleton rows={5} cols={7} /></td></tr>
              ) : crew.length === 0 ? (
                <tr><td colSpan={7}>
                  <EmptyState
                    title="No crew members yet"
                    description="Add crew members to assign them to waste collection tasks."
                    action={
                      <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => setShowCreateModal(true)}>
                        Add Crew Member
                      </Button>
                    }
                  />
                </td></tr>
              ) : (
                crew.map((member) => (
                  <tr key={member.crewId} className="table-row-hover">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-primary-700">
                            {member.name[0]?.toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{member.name}</p>
                          <p className="text-xs text-gray-400">{member.crewId.slice(-8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="flex items-center gap-1.5 text-gray-700 text-xs">
                        <Mail className="w-3.5 h-3.5 text-gray-400" /> {member.email}
                      </p>
                      {member.phone && (
                        <p className="flex items-center gap-1.5 text-gray-500 text-xs mt-0.5">
                          <Phone className="w-3.5 h-3.5 text-gray-400" /> {member.phone}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {(member as any).location ? (
                        <p className="flex items-center gap-1.5 text-gray-700 text-xs">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          {(member as any).location}
                        </p>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Not set</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-1.5 text-gray-700">
                        <CheckSquare className="w-4 h-4 text-gray-400" />
                        {member.activeTasks}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs">
                      {member.lastLogin ? (
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          {formatDistanceToNow(new Date(member.lastLogin), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Never</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={member.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => {
                          setEditingMember(member);
                          setLocationDraft(member.location ?? '');
                          setForm((current) => ({
                            ...current,
                            locationLat: member.locationLat?.toString() ?? '',
                            locationLng: member.locationLng?.toString() ?? '',
                          }));
                          setLocationError(null);
                        }}
                        className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors mr-1"
                        title="Edit assignment location"
                        aria-label={`Edit assignment location for ${member.name}`}
                      >
                        <MapPin className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(member.crewId)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Deactivate member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={showCreateModal}
        onClose={closeModal}
        title="Add Crew Member"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" isLoading={submitting} onClick={handleSubmit}>
              Create Account
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {submitError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <Input
            label="Full Name"
            value={form.name}
            onChange={f('name')}
            placeholder="e.g. Thabo Nkosi"
            error={formErrors.name}
            required
          />
          <Input
            label="Email Address"
            type="email"
            value={form.email}
            onChange={f('email')}
            placeholder="thabo@cleanloop.co.za"
            error={formErrors.email}
            required
          />
          <Input
            label="Phone Number"
            type="tel"
            value={form.phone}
            onChange={f('phone')}
            placeholder="+27 82 000 0000"
            error={formErrors.phone}
            hint="Optional. Must include country code, e.g. +27 for South Africa."
          />
          <Input
            label="Location"
            value={form.location}
            onChange={f('location')}
            placeholder="e.g. Molyko, Buea"
            error={formErrors.location}
            required
            hint="Used to find the nearest crew member for each report."
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Latitude (optional)" type="number" value={form.locationLat} onChange={f('locationLat')} placeholder="4.15" error={formErrors.locationLat} />
            <Input label="Longitude (optional)" type="number" value={form.locationLng} onChange={f('locationLng')} placeholder="9.24" />
          </div>
          <p className="-mt-2 text-xs text-gray-500">If geocoding is unavailable, right-click the crew base in Google Maps and copy its coordinates.</p>
          <div className="relative">
            <Input
              label="Temporary Password"
              type={showPassword ? 'text' : 'password'}
              value={form.temporaryPassword}
              onChange={f('temporaryPassword')}
              placeholder="Min. 8 characters, 1 uppercase, 1 number"
              error={formErrors.temporaryPassword}
              required
              hint="The crew member will be asked to change this on first login."
              rightIcon={
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
          </div>
        </div>
      </Modal>

      {editingMember && (
        <Modal
          isOpen={!!editingMember}
          onClose={() => setEditingMember(null)}
          title={`Assignment location: ${editingMember.name}`}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditingMember(null)}>Cancel</Button>
              <Button variant="primary" isLoading={savingLocation} onClick={handleLocationUpdate}>Save location</Button>
            </>
          }
        >
          <div className="space-y-3">
            {locationError && <p className="text-sm text-red-700">{locationError}</p>}
            <Input
              label="Crew base location"
              value={locationDraft}
              onChange={(event) => setLocationDraft(event.target.value)}
              placeholder="e.g. Molyko, Buea"
              required
              hint="The address is geocoded within Buea and used for nearest-crew assignment."
            />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Latitude (optional)" type="number" value={form.locationLat} onChange={f('locationLat')} placeholder={editingMember.locationLat?.toString() ?? '4.15'} />
              <Input label="Longitude (optional)" type="number" value={form.locationLng} onChange={f('locationLng')} placeholder={editingMember.locationLng?.toString() ?? '9.24'} />
            </div>
            <p className="text-xs text-gray-500">If geocoding is unavailable, right-click the crew base in Google Maps and copy its coordinates.</p>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          isOpen={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          title="Deactivate Crew Member"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="danger" isLoading={deleting} onClick={() => handleDeactivate(confirmDelete)}>
                Deactivate
              </Button>
            </>
          }
        >
          <p className="text-sm text-gray-600">
            Are you sure you want to deactivate this crew member? They will lose access to the CleanLoop app.
          </p>
        </Modal>
      )}
    </div>
  );
}