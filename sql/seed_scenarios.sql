-- Crée une policy SAV par défaut si absente
insert into public.policies (name, rules_json)
select 'Politique par défaut', jsonb_build_object(
  'max_discount_percent', 15,
  'redelivery_condition', 'Si enquête transporteur < 48h ou preuve de non-livraison',
  'refund_condition', 'Produit défectueux avéré ou non conforme'
)
where not exists (select 1 from public.policies where name = 'Politique par défaut');

-- Récupère l'id de la policy par défaut
with p as (
  select id from public.policies where name = 'Politique par défaut' limit 1
)
-- Insère 15 scénarios types (idempotent par title)
insert into public.scenarios (title, level, mode, persona, goals, hints, policy_id)
select t.title, t.level, t.mode, t.persona, t.goals, t.hints, (select id from p)
from (values
  ('Colis livré mais non reçu', 1, 'chat', 'Client pressé', 'Vérifier livraison, proposer solution conforme.', 'Toujours vérifier l''adresse; proposer relivraison si enquête ouverte.', null),
  ('Produit défectueux à réception', 1, 'chat', 'Client déçu', 'Proposer RMA ou remise selon photos.', 'Demander preuve photo, RMA si panne immédiate.', null),
  ('Taille vêtement incorrecte', 1, 'chat', 'Client hésitant', 'Proposer échange ou remise.', 'Vérifier stock pour échange.', null),
  ('Remboursement retardé', 1, 'chat', 'Client agacé', 'Vérifier statut, rassurer, donner délais.', 'Rester factuel, donner date précise.', null),
  ('Erreur de couleur', 1, 'chat', 'Client poli', 'Proposer échange rapide.', 'Excuses + étiquette retour.', null),
  ('Accessoire manquant', 2, 'chat', 'Client pointilleux', 'Envoyer accessoire ou remise.', 'Vérifier SKU du bundle.', null),
  ('Garantie 2 ans — panne 13 mois', 2, 'chat', 'Client technique', 'Proposer réparation/échange selon politique.', 'Vérifier numéro de série.', null),
  ('Double débit bancaire', 2, 'chat', 'Client inquiet', 'Escalader finance, rassurer.', 'Demander preuve relevé.', null),
  ('Livraison très en retard', 2, 'chat', 'Client pressé', 'Proposer geste commercial modéré.', 'Consulter suivi transporteur.', null),
  ('Produit incompatible', 2, 'chat', 'Client confus', 'Clarifier usage et compatibilité, proposer solution.', 'Lien vers compatibilité.', null),
  ('Annulation hors délai', 3, 'chat', 'Client insistant', 'Expliquer conditions, proposer alternative.', 'Rester ferme, empathique.', null),
  ('Utilisation abusive promo', 3, 'chat', 'Client opportuniste', 'Refuser poliment selon politique.', 'Expliquer plafond de remise.', null),
  ('Adresse introuvable', 3, 'chat', 'Client coopératif', 'Vérifier adresse complète, relivrer.', 'Demander point relais.', null),
  ('Article manquant dans lot', 3, 'chat', 'Client mécontent', 'Renvoyer article manquant.', 'Contrôle de préparation.', null),
  ('Demande remboursement intégral après utilisation', 3, 'chat', 'Client difficile', 'Refuser selon CGV, proposer geste minime.', 'Rappeler conditions de retour.', null)
) as t(title, level, mode, persona, goals, hints, unused)
on conflict (title) do nothing;
