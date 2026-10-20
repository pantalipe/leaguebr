// Names follow the community wiki; upstream filenames are preserved verbatim.
const definitions = [
  ['stone', 'Stone', '0-stone'],
  ['bronze', 'Bronze', '1-bronze'],
  ['iron', 'Iron', '2-iron'],
  ['silver', 'Silver', '3-silver'],
  ['gold', 'Gold', '4-gold'],
  ['mithril', 'Mithril', '5-mithril'],
  ['orichalcum', 'Orichalcum', '6-orichalcum'],
  ['arcanite', 'Arcanite', '7-arcanite'],
  ['adamant', 'Adamant', '8-adamant'],
  ['ether', 'Ether', '9-ether'],
  ['black-mithril', 'Black Mythril', '10-blackmithril'],
  ['demon-metal', 'Demon Metal', '11-demonmetal'],
  ['dragonos', 'Dragonos', '12-dragonos'],
  ['ragnablood', 'Ragnablood', '13-ragnablood'],
  ['warfrost', 'Warfrost', '14-winterfrost'],
  ['dark-nox', 'Dark Nox', '15-darknox'],
  ['blue-abyss', 'Blue Abyss', '16-blueabyss'],
  ['infinaut', 'Infinaut', '17-infinaut'],
  ['cyclos', 'Cyclos', '18-cyclos'],
  ['ancient-canine', 'Ancient Canine', '19-ancientcanine'],
  ['gigarock', 'Gigarock', '20-gigarock'],
  ['eisenhart', 'Eisenhart', '21-eisenhart'],
  ['diadust', 'Diadust', '22-diadust'],
  ['eldenwood', 'Eldenwood', '23-elderwood']
];

export const PROMOTIONS = Object.freeze(definitions.map(([id, name, file]) => Object.freeze({
  id, name, image: `assets/promotions/${file}.png`
})));

export const getPromotion = (id) => PROMOTIONS.find((promotion) => promotion.id === id) ?? null;
