import type { MetaError } from '../meta/meta.types';

/**
 * Instagram-specific response shapes.
 *
 * The messaging wire format itself lives in `../meta/meta.types` — Meta
 * delivers Instagram Direct through the same envelope as Messenger. Only the
 * profile edge differs, because Instagram exposes a handle where Messenger
 * exposes a first and last name.
 */
export interface InstagramProfileResponse {
  id?: string;
  name?: string;
  username?: string;
  profile_pic?: string;
  follower_count?: number;
  is_verified_user?: boolean;
  error?: MetaError;
}
