import { isBlank } from "./validators";

export function profileRequiresPasswordChange(profile) {
  return profile?.must_change_password === true;
}

export function hasMissingProfileFields(profile) {
  return (
    !profile ||
    isBlank(profile.first_name) ||
    isBlank(profile.last_name) ||
    isBlank(profile.store)
  );
}

export function isOnboardingRequired({ user, profile, loadingProfile }) {
  return (
    !!user &&
    !loadingProfile &&
    (profileRequiresPasswordChange(profile) || hasMissingProfileFields(profile))
  );
}

export function resolveInitialRoute({ user, onboardingRequired }) {
  return user && !onboardingRequired ? "/Homepage" : "/login";
}
