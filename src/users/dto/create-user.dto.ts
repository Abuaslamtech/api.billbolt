export class CreateUserDto {
  firebaseUid: string;
  email: string;
  password: string;

  fullName?: string;
  phone?: string;
  business: {
    name: string;
      type: string;
  };
}
