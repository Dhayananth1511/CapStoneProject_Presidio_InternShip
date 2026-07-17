export interface User {
  id: string;
  name: string;
  email: string;
  role: 'traveler' | 'admin';
  hasCalendarLinked?: boolean;
}
