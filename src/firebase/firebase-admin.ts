// Safe stub - all authentication is handled via GoogleAuthService and JWT (Scath Architecture)
export const admin = {
  auth: () => ({
    getUserByEmail: async (email?: string) => ({
      providerData: [] as { providerId: string }[],
    }),
    verifyIdToken: async (token?: string) => ({
      uid: '',
      email: '',
    }),
  }),
};