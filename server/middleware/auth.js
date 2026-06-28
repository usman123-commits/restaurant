import jwt from 'jsonwebtoken';

const PUBLIC_PATHS = ['/api/login', '/api/auth/check', '/api/health'];

export default function authMiddleware(req, res, next) {
  if (PUBLIC_PATHS.includes(req.path)) {
    return next();
  }

  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
