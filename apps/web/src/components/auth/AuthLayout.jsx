import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ArrowLeft, ArrowUpRight, Check } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeControls';
import './auth.css';

/** Frame account access in the shared BuildAndDo editorial identity. */
export default function AuthLayout({ title, pageTitle = title, subtitle, children, footer }) {
    return (
        <div className="auth-shell">
            <Helmet>
                <title>{pageTitle} · BuildAndDo</title>
                <meta name="robots" content="noindex,nofollow" />
                <meta
                    name="description"
                    content="Learn by doing. Build something real. Verify what you did. Do it together. Sign in to your BuildAndDo workspace."
                />
            </Helmet>
            <header className="auth-masthead">
                <Link to="/" className="auth-brand" aria-label="BuildAndDo home">
                    <span className="auth-monogram" aria-hidden="true">B<span>&</span>D</span>
                    <span className="auth-brand-type">
                        <span className="auth-wordmark">BuildAndDo</span>
                        <span className="auth-brand-caption">A place to learn. A place to do.</span>
                    </span>
                </Link>
                <div className="auth-masthead-actions">
                    <Link to="/" className="auth-back-link">
                        <ArrowLeft aria-hidden="true" />
                        <span>Back to site</span>
                    </Link>
                    <ThemeToggle />
                </div>
            </header>

            <div className="auth-spread">
                <aside className="auth-editorial" aria-label="About BuildAndDo">
                    <p className="auth-eyebrow"><span aria-hidden="true" /> Ideas become work. Work becomes evidence.</p>
                    <p className="auth-headline">
                        <span>Learn by doing.</span>
                        <span>Build something</span>
                        <em>real. Together.</em>
                    </p>
                    <p className="auth-introduction">
                        Bring a question, a project or a business problem.
                        Work through it with people and AI, and keep the evidence
                        of what you did.
                    </p>
                    <figure className="auth-workbench">
                        <div className="auth-paper-stack" aria-hidden="true">
                            <div className="auth-sheet auth-sheet-learn">
                                <span className="auth-sheet-index">01 / Field notes</span>
                                <span className="auth-sheet-title">Learn.</span>
                                <div className="auth-note-lines"><i /><i /><i /><i /></div>
                                <span className="auth-sheet-caption">Start with a question.</span>
                            </div>
                            <div className="auth-sheet auth-sheet-build">
                                <span className="auth-sheet-index">02 / In practice</span>
                                <span className="auth-sheet-title">Build.</span>
                                <div className="auth-build-diagram"><i /><i /><i /></div>
                                <span className="auth-sheet-caption">Put an idea to work.</span>
                            </div>
                            <div className="auth-sheet auth-sheet-verify">
                                <span className="auth-sheet-index">03 / The evidence</span>
                                <span className="auth-sheet-title">Verify.</span>
                                <div className="auth-proof-mark"><Check strokeWidth={1.5} /></div>
                                <span className="auth-sheet-caption">Show what changed.</span>
                            </div>
                        </div>
                        <figcaption>
                            <span className="auth-caption-rule" aria-hidden="true" />
                            Learn something. Make something. Show your work.
                        </figcaption>
                    </figure>
                </aside>

                <main id="main-content" tabIndex={-1} className="auth-main">
                    <div className="auth-form-panel">
                        <div className="auth-form-heading">
                            <p className="auth-eyebrow">Your BuildAndDo account</p>
                            <h1>{title}</h1>
                            {subtitle && <p className="auth-form-subtitle">{subtitle}</p>}
                        </div>
                        <div className="auth-form-content">{children}</div>
                        {footer && <div className="auth-form-footer">{footer}</div>}
                    </div>
                    <Link to="/classrooms" className="auth-classroom-link">
                        <span>
                            <span className="auth-classroom-label">Better, together.</span>
                            Explore BuildAndDo Classrooms
                        </span>
                        <ArrowUpRight aria-hidden="true" />
                    </Link>
                </main>
            </div>

            <footer className="auth-colophon">
                <p>Learn · Build · Verify · Together</p>
                <Link to="/docs">Help & docs <ArrowUpRight aria-hidden="true" /></Link>
            </footer>
        </div>
    );
}
