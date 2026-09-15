import { redirect } from 'next/navigation';

/**
 * Settings has no landing screen of its own. Integrations is the first thing
 * anyone sets up, so /settings goes straight there rather than showing a menu
 * that duplicates the sidebar.
 */
export default function SettingsIndexPage() {
  redirect('/settings/integrations');
}
