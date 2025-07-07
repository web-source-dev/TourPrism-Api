const generateWeeklyDigestEmail = (params) => {
  const {
    FIRSTNAME,
    LOCATION,
    DISRUPTION_COUNT,
    IS_REGISTERED,
    SIGNUP_LINK,
    DASHBOARD_LINK,
    SUPPORT_EMAIL,
    WEBSITE,
    LINKEDIN,
    TWITTER,
    COMPANY_NAME,
    COMPANY_LOCATION,
    unsubscribe,
    update_profile
  } = params;

  // Generate alert sections dynamically
  const generateAlertSection = (index) => {
    const emoji = params[`ALERT${index}_EMOJI`];
    const header = params[`ALERT${index}_HEADER`];
    const start = params[`ALERT${index}_START`];
    const end = params[`ALERT${index}_END`];
    const body = params[`ALERT${index}_BODY`];

    if (!header) return ''; // Skip if no alert data

    return `
      <div class="disruption">
        ${emoji} ${header} (${start} – ${end})<br />
        ${body}
      </div>
    `;
  };

  // Generate all alert sections
  const alertSections = Array.from({ length: DISRUPTION_COUNT }, (_, i) => 
    generateAlertSection(i + 1)
  ).join('');

  // Call-to-action link based on registration status
  const ctaLink = IS_REGISTERED === 'true'
    ? `<a href="${DASHBOARD_LINK}" class="cta-link">Go to your Dashboard →</a>`
    : `<a href="${SIGNUP_LINK}" class="cta-link">Create Free Account →</a>`;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Disruption Alert</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #fff;
            color: #000;
            padding: 30px;
            line-height: 1.6;
          }
          .disruption {
            margin-bottom: 20px;
            border-top: 1px solid #ccc;
            padding-top: 10px;
          }
          a {
            color: #0066cc;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          .cta-link {
            color: #0066cc;
            font-weight: 500;
          }
          .contact-links {
            margin-top: 20px;
          }
          .contact-links a {
            display: block;
            margin-bottom: 5px;
          }
          .footer {
            margin-top: 40px;
            font-size: 12px;
            color: #666;
          }
          .footer a {
            color: #666;
          }
        </style>
      </head>
      <body>
        <p>Hi ${FIRSTNAME},</p>

        <p>
          Here are ${DISRUPTION_COUNT} key disruptions that may affect tourism operations in ${LOCATION} this week:
        </p>

        ${alertSections}

        <p>
          Want to see what else is impacting your operations this week?<br />
          ${ctaLink}
        </p>

        <div class="contact-links">
          <p>Need Help? Contact Us:</p>
          <a href="mailto:${SUPPORT_EMAIL}">📧 ${SUPPORT_EMAIL}</a>
          <a href="${WEBSITE}">🌐 ${WEBSITE}</a>
          <a href="${LINKEDIN}">🔗 LinkedIn</a>
          <a href="${TWITTER}">🐦 Twitter</a>
        </div>

        <div class="footer">
          ${COMPANY_NAME}, ${COMPANY_LOCATION}<br />
          You are receiving this email because you signed up for weekly disruption forecasts from ${COMPANY_NAME}.<br />
          <a href="${update_profile}">Update Preferences</a> | <a href="${unsubscribe}">Unsubscribe</a>
        </div>
      </body>
    </html>
  `;
};

export default generateWeeklyDigestEmail; 