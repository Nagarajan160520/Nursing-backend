(async () => {
  try {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'TEST2025001', password: 'test123' })
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Status:', res.status);
      console.error('Body:', data);
      process.exit(1);
    }

    console.log('Login response:', data);
  } catch (err) {
    console.error('Request error:', err.message);
    process.exit(1);
  }
})();
