// Initialize Feather Icons
feather.replace();

// Secret Keyboard Shortcut to Access Admin Broadcaster Console (Ctrl + Shift + A)
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    window.location.href = 'admin.html';
  }
});
