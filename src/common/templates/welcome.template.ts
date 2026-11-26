export function getWelcomeTemplate(): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8" />

        <meta name="viewport"
              content="width=device-width, initial-scale=1.0" />

        <title>Coursify API</title>

        <style>
            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            body {
                font-family: system-ui, sans-serif;
                background: #f8fafc;
                color: #0f172a;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;
            }

            .container {
                width: 100%;
                max-width: 560px;
                padding: 40px;
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 24px;
                box-shadow: 0 20px 60px #0f172a0a;
            }

            .brand {
                color: #2563eb;
                font-weight: 800;
                font-size: 14px;
                letter-spacing: 3px;
                margin-bottom: 20px;
            }

            .status {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                background: #f0fdf4;
                color: #15803d;
                border: 1px solid #bbf7d0;
                padding: 7px 14px;
                border-radius: 30px;
                font-size: 13px;
                font-weight: 600;
                margin-bottom: 20px;
            }

            .dot {
                width: 8px;
                height: 8px;
                background: #22c55e;
                border-radius: 50%;
                animation: pulse 2s infinite;
            }

            @keyframes pulse {
                50% {
                    opacity: 0.4;
                }
            }

            h1 {
                font-size: 32px;
                letter-spacing: -1px;
                margin-bottom: 12px;
            }

            p {
                color: #64748b;
                font-size: 15px;
                line-height: 1.7;
            }

            .info {
                margin: 28px 0;
                padding: 20px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 14px;
            }

            .info-row {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                padding: 10px 0;
                font-size: 14px;
            }

            .info-row span {
                color: #64748b;
            }

            .actions {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
            }

            a {
                text-decoration: none;
                padding: 12px 20px;
                border-radius: 10px;
                font-size: 14px;
                font-weight: 600;
                transition: 0.2s;
            }

            .primary {
                background: #2563eb;
                color: white;
            }

            .primary:hover {
                background: #1d4ed8;
            }

            .secondary {
                border: 1px solid #e2e8f0;
                color: #334155;
            }

            .secondary:hover {
                background: #f1f5f9;
            }

            footer {
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e2e8f0;
                font-size: 12px;
                color: #94a3b8;
            }

            @media (max-width: 480px) {
                .container {
                    padding: 24px;
                }

                h1 {
                    font-size: 26px;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .dot {
                    animation: none;
                }
            }
        </style>
    </head>

    <body>
        <main class="container">

            <div class="brand">COURSIFY</div>

            <div class="status">
                <span class="dot"></span>
                API Online
            </div>

            <h1>Welcome to Coursify API</h1>

            <p>
                The backend infrastructure powering a modern
                learning management platform.
            </p>

            <div class="info">
                <div class="info-row">
                    <span>API Version</span>
                    <strong>v1.0.0</strong>
                </div>

                <div class="info-row">
                    <span>Framework</span>
                    <strong>NestJS</strong>
                </div>

                <div class="info-row">
                    <span>API Architecture</span>
                    <strong>GraphQL</strong>
                </div>

                <div class="info-row">
                    <span>Database</span>
                    <strong>PostgreSQL</strong>
                </div>
            </div>

            <div class="actions">
                <a href="/graphql" class="primary">
                    Explore GraphQL
                </a>

                <a href="/health" class="secondary">
                    Health Check
                </a>
            </div>

            <footer>
                &copy; ${new Date().getFullYear()} Coursify.
                All rights reserved.
            </footer>

        </main>
    </body>
    </html>
    `;
}