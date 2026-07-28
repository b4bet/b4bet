// Recovery handler — add this inside App component's useEffect
// bus.on('auth:recovery', () => openAuthModal('change'));
// This is handled inside AuthModal.tsx via onAuthStateChange + bus emit
// App.tsx needs to listen and open the modal
export {};
