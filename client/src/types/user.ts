import { UserRole } from '../constants/enums';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  hasCalendarLinked?: boolean;
}
