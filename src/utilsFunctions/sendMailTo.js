const nodemailer = require("nodemailer");

async function sendMailTo(email, message) {
  try {
    // Configuration du transporteur SMTP
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "harounakinda.pro@gmail.com", // Remplace par ton adresse Gmail
        pass: "ytfe evea dxyr ynik", // Remplace par une variable d'environnement pour plus de sécurité
      },
    });

    // Contenu de l'e-mail
    const mailOptions = {
      from: "harounakinda.pro@gmail.com",
      to: email,
      subject: "NOUVEL ABONNEMENT WAARIKO",
      html: `<!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NOUVEL ABONNEMENT WAARIKO</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #fff;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          }
          img {
            max-width: 100%;
            height: auto;
            margin-bottom: 20px;
          }
          .message {
            background-color: #f0f0f0;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 18px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <img src="https://ucarecdn.com/70280d7e-8198-4787-b773-b622e2591c28/-/preview/494x505/" alt="Waariko logo">
          <h2>NOUVEL ABONNEMENT WAARIKO</h2>
          <p>Un nouvel abonnement à waariko vient d'être effectué:</p>
          <p class="message">${message}</p>
        </div>
      </body>
      </html>`,
    };

    // Envoi de l'e-mail
    const info = await transporter.sendMail(mailOptions);
    console.log("E-mail envoyé avec succès: %s", info.messageId);
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'e-mail: ", error);
  }
}

module.exports = { sendMailTo };
