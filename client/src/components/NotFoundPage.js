import React from 'react';
import { Link } from 'react-router-dom';

function NotFoundPage() {
    return (
        <div className="not-found-page">
            <p className="not-found-code">404</p>
            <h1 className="not-found-title">Page not found</h1>
            <p className="not-found-copy">
                The page you requested does not exist or may have been moved.
            </p>
            <Link className="btn btn-primary" to="/">
                Return to Signup
            </Link>
        </div>
    );
}

export default NotFoundPage;
