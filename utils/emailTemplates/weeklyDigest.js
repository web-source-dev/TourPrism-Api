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

  // Generate alert sections dynamically with new formatting
  const calendarIcon = 'https://png.pngtree.com/png-vector/20230407/ourmid/pngtree-calendar-line-icon-vector-png-image_6692970.png';
  const generateAlertSection = (index, isFirst) => {
    const emoji = params[`ALERT${index}_EMOJI`];
    const header = params[`ALERT${index}_HEADER`];
    const start = params[`ALERT${index}_START`];
    const end = params[`ALERT${index}_END`];
    let body = params[`ALERT${index}_BODY`] || '';
    let recommended = params[`ALERT${index}_RECOMMENDED`] || '';
    if (!header) return '';
    // Split body and recommended action if possible
    if (body.includes('Recommended:')) {
      const parts = body.split('Recommended:');
      body = parts[0].trim();
      recommended = parts[1] ? parts[1].trim() : '';
    }
    return `
      <div style="${!isFirst ? 'border-top:1px solid #eee;margin-top:24px;padding-top:20px;' : ''}margin-bottom:24px;text-align:left;">
        <div style="font-size:18px;font-weight:700;color:#111;display:flex;align-items:center;gap:8px;text-align:left;">
          <span style='margin-right:8px;'>${emoji}</span>${header}
        </div>
        <div style="font-size:14px;color:#444;margin:4px 0 8px 0;display:flex;align-items:center;text-align:left;">
          <img src="${calendarIcon}" alt="Calendar" style="width:1.2em;height:1.2em;margin-right:10px;display:inline-block;" />${start} – ${end}
        </div>
        <div style="font-size:15px;color:#111;text-align:left;">
          <span>${body}</span>
          ${recommended ? `<span style='font-weight:600;margin-left:2px;'>${recommended}</span>` : ''}
        </div>
      </div>
    `;
  };

  // Generate all alert sections with new formatting
  const alertSections = Array.from({ length: DISRUPTION_COUNT }, (_, i) =>
    generateAlertSection(i + 1, i === 0)
  ).join('');

  // Call-to-action link based on registration status
  const ctaLink = IS_REGISTERED === 'true'
    ? `<a href="${DASHBOARD_LINK}" style="color:#0066cc;font-weight:500;text-decoration:none;">Go to your Dashboard</a> to view latest disruption updates.`
    : `<a href="${SIGNUP_LINK}" style="color:#0066cc;font-weight:500;text-decoration:none;">Create Free Account</a> to access disruption alerts as they unfold.`;

  // Social icons
  const linkedinIcon = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRokEYt0yyh6uNDKL8uksVLlhZ35laKNQgZ9g&s';
  const twitterIcon = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Logo_of_Twitter.svg/1200px-Logo_of_Twitter.svg.png';
  const FooterImageUrl = 'https://tourprism.com/ashan.jpg';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #fff;
            color: #000;
            padding: 30px;
            line-height: 1.6;
            text-align: left;
          }
          .footer {
            margin-top: 40px;
            font-size: 14px;
            color: #222;
            text-align: left;
            max-width: 400px;
            padding-bottom: 0;
          }
          .footer-row {
            display: flex;
            align-items: flex-start;
            gap: 16px;
          }
          .footer-img {
            width: 70px;
            height: 70px;
            border-radius: 50%;
            object-fit: cover;
            margin-right: 8px;
          }
          .footer-content {
            flex: 1;
            margin-left: 10px;
          }
          .footer-name {
            font-weight: 700;
            font-size: 20px;
            margin-bottom: 2px;
          }
          .footer-message {
            font-size: 15px;
            margin-bottom: 4px;
            font-weight: 500;
          }
          .footer-email {
            color: #0066cc;
            font-size: 15px;
            text-decoration: none;
            margin-bottom: 8px;
            display: inline-block;
          }
          .footer-social {
            margin: 8px 0 0 0;
            border-radius: 5px;

          }
          .footer-social a {
            height: 28px;
            width: 28px;
            display: inline-block;
            margin-right: 8px;
          }
          .footer-divider {
            border-top: 1px solid #eee;
            margin: 24px 0 0 0;
          }
          .footer-links {
            color: #bbb;
            font-size: 14px;
            margin-top: 12px;
            padding-top: 8px;
            text-align: left;
          }
          .footer-links a {
            color: #bbb;
            text-decoration: none;
            margin: 0 8px;
          }
        </style>
      </head>
      <body>
        <div style="font-size:15px;margin-bottom:24px;text-align:left;">Hi ${FIRSTNAME},<br><br>
        We’ve reviewed what’s unfolding across <b>${LOCATION}</b> and selected the top 5 disruptions that are most likely to affect tour operators like you this week.<br><br>
        Here’s what to keep an eye on:
        </div>
        ${alertSections}
        <div style="font-size:15px;margin:32px 0 24px 0;text-align:left;">We’ll keep monitoring what’s coming and make sure you’re always informed early.<br><br>${ctaLink}</div>
        <div class="footer">
          <div class="footer-row">
            <img src="${FooterImageUrl}" alt="Ashan" class="footer-img" />
            <div class="footer-content">
              <div class="footer-name">Ashan from Tourprism</div>
              <div class="footer-message">Have thoughts or feedback?<br />I’d love to hear from you.</div>
              <a href="mailto:support@tourprism.com" class="footer-email">support@tourprism.com</a>
              <div class="footer-social">
                <a href="${LINKEDIN}" target="_blank"><img src="${linkedinIcon}" alt="LinkedIn" style="width:28px;height:28px;vertical-align:middle;" /></a>
                <a href="${TWITTER}" target="_blank"><img src="${twitterIcon}" alt="Twitter" style="width:28px;height:28px;vertical-align:middle;" /></a>
              </div>
              <div class="footer-divider"></div>
              <div class="footer-links">
                <a href="${update_profile}">Update Preferences</a> |
                <a href="${unsubscribe}">Unsubscribe</a>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

export default generateWeeklyDigestEmail; 