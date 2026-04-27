const webpush = require('web-push');

// Configure VAPID keys
// The user provided the keys. They will add them to Netlify environment variables:
// VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
try {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:safarrrides@gmail.com',
    process.env.VAPID_PUBLIC_KEY || 'BKWUx27yPtwTWcQBYo_O9Rjv-z_q2cZ_f_r3Nc8SOl6EFEN3gamdkYviA4RfZSjXpnwzGPI-3O9BoMO_dIjMUU8',
    process.env.VAPID_PRIVATE_KEY
  );
} catch (e) {
  console.warn('Web push setup error:', e);
}

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: 'OK' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

  try {
    const { subscriptions, payload } = JSON.parse(event.body);

    if (!subscriptions || !Array.isArray(subscriptions)) {
      return { statusCode: 400, body: 'Invalid subscriptions array' };
    }

    const notificationPayload = JSON.stringify(payload);

    // Send notifications to all provided subscriptions
    const promises = subscriptions.map((sub) =>
      webpush.sendNotification(sub, notificationPayload).catch((err) => {
        console.error('Error sending push to a driver', err);
        return { success: false, err };
      })
    );

    await Promise.all(promises);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Notifications sent successfully' })
    };
  } catch (error) {
    console.error('Error in notify-drivers function', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
