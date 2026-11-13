import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { Alert, EmptyState, FormField, PageLoader, Spinner } from "../../components/ui";
import { api, errorMessage, fieldErrors } from "../../lib/api";
import type { AccountSummary } from "../../lib/types";

export function AccountProfile() {
  const { user, refresh } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const summary = useQuery({
    queryKey: ["account", "summary"],
    queryFn: () => api<AccountSummary>("/account")
  });

  const [profile, setProfile] = useState({ name: "", phone: "" });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileFields, setProfileFields] = useState<Record<string, string>>({});
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordFields, setPasswordFields] = useState<Record<string, string>>({});
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  useEffect(() => {
    const current = summary.data?.user ?? user;
    if (!current) return;
    setProfile({ name: current.name, phone: current.phone ?? "" });
  }, [summary.data?.user, user]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileError(null);
    setProfileFields({});
    setProfileSaved(false);
    if (profile.name.trim().length < 2) {
      setProfileFields({ name: "Enter your name." });
      return;
    }
    if (profile.phone && !/^[6-9]\d{9}$/.test(profile.phone)) {
      setProfileFields({ phone: "Enter a valid 10-digit mobile number." });
      return;
    }
    setProfileBusy(true);
    try {
      await api("/account", {
        method: "PATCH",
        body: { name: profile.name.trim(), phone: profile.phone || undefined }
      });
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ["account"] });
      setProfileSaved(true);
      notify("Your details were updated.");
    } catch (error) {
      setProfileFields(fieldErrors(error));
      setProfileError(errorMessage(error));
    } finally {
      setProfileBusy(false);
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordFields({});
    setPasswordSaved(false);
    if (passwords.next !== passwords.confirm) {
      setPasswordFields({ confirm: "The new passwords do not match." });
      return;
    }
    if (passwords.next.length < 10 || !/[A-Za-z]/.test(passwords.next) || !/\d/.test(passwords.next)) {
      setPasswordFields({ next: "Use at least 10 characters with a letter and a number." });
      return;
    }
    setPasswordBusy(true);
    try {
      await api("/auth/password", {
        method: "POST",
        body: { currentPassword: passwords.current, newPassword: passwords.next }
      });
      setPasswords({ current: "", next: "", confirm: "" });
      setPasswordSaved(true);
      notify("Password changed. Other sessions were signed out.");
    } catch (error) {
      setPasswordFields(fieldErrors(error));
      setPasswordError(errorMessage(error));
    } finally {
      setPasswordBusy(false);
    }
  };

  if (summary.isLoading) return <PageLoader label="Loading your details…" />;
  if (summary.isError) {
    return (
      <EmptyState
        title="Your details could not be loaded"
        description={errorMessage(summary.error)}
        action={{ label: "Try again", onClick: () => void summary.refetch() }}
      />
    );
  }

  return (
    <div>
      <header className="account-heading">
        <p className="eyebrow">Your details</p>
        <h1>Profile & security</h1>
        <p>Keep your contact information current so the store can reach you about an order.</p>
      </header>

      <section className="account-section">
        <h2>Contact information</h2>
        <p className="account-muted">Email: {summary.data?.user.email}</p>
        {profileError ? <Alert tone="error">{profileError}</Alert> : null}
        {profileSaved ? <Alert tone="success">Your details are saved.</Alert> : null}
        <form onSubmit={saveProfile} className="profile-form">
          <FormField label="Full name" htmlFor="profile-name" error={profileFields.name}>
            <input
              id="profile-name"
              value={profile.name}
              onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
              autoComplete="name"
              maxLength={80}
              required
            />
          </FormField>
          <FormField label="Mobile number" htmlFor="profile-phone" error={profileFields.phone} hint="Optional.">
            <input
              id="profile-phone"
              type="tel"
              inputMode="numeric"
              value={profile.phone}
              onChange={(event) =>
                setProfile((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))
              }
              autoComplete="tel"
            />
          </FormField>
          <button type="submit" className="button button--primary" disabled={profileBusy}>
            {profileBusy ? <Spinner label="Saving details" /> : null}
            {profileBusy ? "Saving…" : "Save details"}
          </button>
        </form>
      </section>

      <section className="account-section">
        <h2>Password</h2>
        <p className="account-muted">
          Changing your password signs out other sessions. Password recovery by email is not available yet on this store.
        </p>
        {passwordError ? <Alert tone="error">{passwordError}</Alert> : null}
        {passwordSaved ? <Alert tone="success">Your password has been changed.</Alert> : null}
        <form onSubmit={savePassword} className="profile-form">
          <FormField label="Current password" htmlFor="current-password" error={passwordFields.currentPassword}>
            <input
              id="current-password"
              type="password"
              value={passwords.current}
              onChange={(event) => setPasswords((current) => ({ ...current, current: event.target.value }))}
              autoComplete="current-password"
              required
            />
          </FormField>
          <FormField label="New password" htmlFor="new-password" error={passwordFields.newPassword} hint="At least 10 characters with a letter and a number.">
            <input
              id="new-password"
              type="password"
              value={passwords.next}
              onChange={(event) => setPasswords((current) => ({ ...current, next: event.target.value }))}
              autoComplete="new-password"
              minLength={10}
              required
            />
          </FormField>
          <FormField label="Confirm new password" htmlFor="confirm-password" error={passwordFields.confirm}>
            <input
              id="confirm-password"
              type="password"
              value={passwords.confirm}
              onChange={(event) => setPasswords((current) => ({ ...current, confirm: event.target.value }))}
              autoComplete="new-password"
              required
            />
          </FormField>
          <button type="submit" className="button button--quiet" disabled={passwordBusy}>
            {passwordBusy ? <Spinner label="Changing password" /> : null}
            {passwordBusy ? "Changing…" : "Change password"}
          </button>
        </form>
      </section>
    </div>
  );
}
