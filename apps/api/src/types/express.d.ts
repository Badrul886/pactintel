import { AuthenticatedUser } from '../common/guards/auth.guard';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
