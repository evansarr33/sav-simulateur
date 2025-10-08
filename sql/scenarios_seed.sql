-- Jeu de 15 scénarios clients pour la plateforme SAV
-- À exécuter dans la base Supabase (schéma public)
-- Chaque entrée représente un dossier client avec son niveau de difficulté,
-- le type de persona à incarner et le canal de communication.

INSERT INTO public.scenarios (id, title, level, persona, mode)
VALUES
  (1, 'Retard de livraison sur commande premium', 'Intermédiaire', 'Client fidèle mais pressé', 'Chat'),
  (2, 'Produit reçu endommagé après déménagement', 'Intermédiaire', 'Jeune actif perfectionniste', 'Email'),
  (3, 'Facturation double pour abonnement logiciel', 'Confirmé', 'Responsable achats B2B', 'Chat'),
  (4, 'Carte cadeau expirée suite à hospitalisation', 'Débutant', 'Parent débordé', 'Chat'),
  (5, 'Litige sur reprise d''ancien smartphone', 'Confirmé', 'Client technophile exigeant', 'Appel'),
  (6, 'Erreur de taille sur uniforme professionnel', 'Intermédiaire', 'Responsable RH', 'Email'),
  (7, 'Installation domotique incomplète', 'Expert', 'Propriétaire premium', 'Chat'),
  (8, 'Demande de remboursement billets annulés', 'Débutant', 'Couple senior', 'Email'),
  (9, 'Inadéquation garantie extension', 'Confirmé', 'Commerçant partenaire', 'Chat'),
  (10, 'Perte colis international et frais de douane', 'Expert', 'Entrepreneure e-commerce', 'Chat'),
  (11, 'Crédit fidélité non appliqué en caisse', 'Débutant', 'Client occasionnel hésitant', 'Chat'),
  (12, 'Maintenance urgente contrat énergie', 'Expert', 'Gestionnaire de site industriel', 'Appel'),
  (13, 'Réservation hôtel mal enregistrée', 'Intermédiaire', 'Voyageur business', 'Email'),
  (14, 'SAV électroménager hors délai légal', 'Confirmé', 'Parent de famille nombreuse', 'Appel'),
  (15, 'Problème d''accès application mobile bancaire', 'Expert', 'Cadre financier', 'Chat')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  level = EXCLUDED.level,
  persona = EXCLUDED.persona,
  mode = EXCLUDED.mode;
