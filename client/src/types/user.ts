export interface User {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
}

export interface AuthUser {
  email: string;
  password: string;
}

export interface RegisterUser extends AuthUser {
  username: string;
} 