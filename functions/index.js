const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

/**
 * Cloud Function planifiée : s'exécute chaque jour à 8h00 (heure de Paris).
 * Pour chaque utilisateur ayant configuré un versement automatique,
 * vérifie si le jour du mois est atteint et si le versement n'a pas
 * encore été ajouté ce mois-ci, puis l'ajoute automatiquement.
 */
exports.versementAutomatique = onSchedule(
  {
    schedule: 'every day 08:00',
    timeZone: 'Europe/Paris',
    region: 'europe-west1',
  },
  async () => {
    const db = getFirestore();
    const now = new Date();
    const today = now.getDate();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    console.log(`[versementAutomatique] Vérification du ${today}/${now.getMonth() + 1}/${now.getFullYear()}`);

    const usersSnap = await db.collection('users').get();

    const promises = usersSnap.docs.map(async (userDoc) => {
      const data = userDoc.data();
      const { montantAuto, jourVersement, lastAutoMonth } = data;

      // Vérifications : configuration incomplète
      if (!montantAuto || montantAuto <= 0) return;
      if (!jourVersement || jourVersement <= 0) return;

      // Versement déjà effectué ce mois-ci
      if (lastAutoMonth === currentMonth) return;

      // Jour du mois pas encore atteint
      if (today < jourVersement) return;

      const autoDate = `${currentMonth}-${String(jourVersement).padStart(2, '0')}`;

      try {
        // Ajouter le versement dans la sous-collection
        await db
          .collection('users')
          .doc(userDoc.id)
          .collection('versements')
          .add({
            amount: montantAuto,
            date: autoDate,
            note: 'Versement automatique',
            auto: true,
            createdAt: new Date().toISOString(),
          });

        // Mettre à jour lastAutoMonth pour ne pas doubler
        await db.collection('users').doc(userDoc.id).update({
          lastAutoMonth: currentMonth,
        });

        console.log(`[versementAutomatique] ✓ User ${userDoc.id} — ${montantAuto}€ le ${autoDate}`);
      } catch (err) {
        console.error(`[versementAutomatique] ✗ Erreur user ${userDoc.id}:`, err);
      }
    });

    await Promise.all(promises);
    console.log(`[versementAutomatique] Terminé pour ${currentMonth}`);
  }
);
