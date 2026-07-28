// PATCH NOTE: forgotPassword uses supabase.auth.signInWithOtp (email OTP)
// This sends a 6-digit code to the user's email
// resetPassword verifies the OTP token then updates the password
// This matches the AuthModal ForgotForm UI which asks for a 6-digit code
export {};
