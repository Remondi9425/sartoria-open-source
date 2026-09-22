# Security

This project is experimental. Security fixes target the current main version;
there is no supported production or long-term-support release yet.

Use GitHub's private vulnerability reporting option when it is enabled. If it is
unavailable, contact the maintainer privately through a channel listed on their
GitHub profile and request a confidential reporting channel. Do not put exploit
details, recordings, measurements or credentials in public issues.

Include the affected revision, a minimal synthetic reproduction and the impact.
Do not test against a live deployment without the operator's permission.

The measurement API requires a submission token and a job-specific capability for
results. Token issuance is not a user login, and process-local limits are not a
distributed quota. An unrestricted public deployment needs additional controls;
see docs/deployment.md. Both tokens must be kept out of URLs, analytics and logs.

Before source publication, scan the exact release files and any Git history being
published. A clean current tree does not sanitise older commits.
