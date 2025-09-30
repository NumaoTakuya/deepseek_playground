import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_USE_FIRESTORE_EMULATOR:
      process.env.NEXT_PUBLIC_USE_FIRESTORE_EMULATOR,
    NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST:
      process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST,
    NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT:
      process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT,
  },
};

export default nextConfig;
