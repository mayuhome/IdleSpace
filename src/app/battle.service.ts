import { Injectable } from "@angular/core";
import { createWorker, ITypedWorker } from "typed-web-workers";
import { getUrl } from "./main.service";
import { EnemyManager } from "./model/enemy/enemyManager";
import { BattleRequest, ShipData } from "./workers/battleRequest";
import { Emitters } from "./emitters";
import { Enemy } from "./model/enemy/enemy";

@Injectable({
  providedIn: "root"
})
export class BattleService {
  battleWorker: ITypedWorker<BattleRequest, BattleResult>;
  em: Emitters;
  enemy: Enemy;

  constructor() {
    const url = getUrl();
    this.battleWorker = createWorker({
      workerFunction: this.doBattle,
      onMessage: this.onBattleEnd.bind(this),
      onError: error => {},
      importScripts: [
        url + "break_infinity.min.js",
        url + "assets/ship.js",
        url + "assets/battleResult.js"
      ]
    });
  }
  doBattle(input: BattleRequest, cb: (_: BattleResult) => void): void {
    // console.log(input);
    const initial = Date.now();
    let playerShips = new Array<Ship>();
    let enemyShip = new Array<Ship>();

    //#region Initialize Fleets
    const fleets: Array<[Ship[], ShipData[]]> = [
      [enemyShip, input.enemyFleet],
      [playerShips, input.playerFleet]
    ];
    fleets.forEach(toMake => {
      const ships = toMake[0];
      const design = toMake[1];
      design.forEach(ds => {
        const ship = new Ship();
        ship.id = ds.id;
        ship.armor = Decimal.fromDecimal(ds.totalArmor);
        ship.originalArmor = new Decimal(ship.armor);
        ship.explosionLevel = ds.explosionLevel;
        ship.shield = Decimal.fromDecimal(ds.totalShield);
        ds.modules.forEach(dl => {
          if (Decimal.fromDecimal(dl.computedDamage).gt(0)) {
            ship.modules.push({
              damage: Decimal.fromDecimal(dl.computedDamage),
              shieldPercent: dl.shieldPercent,
              armorPercent: dl.armorPercent
            });
          }
        });
        const qta = Decimal.fromDecimal(ds.quantity).toNumber();
        for (let num = 0; num < qta; num++) {
          ships.push(ship.getCopy());
        }
      });
    });
    // console.log("player ships: " + playerShips.length);
    // console.log("enemy ships: " + enemyShip.length);

    //#endregion
    //#region Battle
    //  Up to 5 rounds
    let battleFleets = [playerShips, enemyShip];
    //  for each round
    for (let round = 0; round < 5; round++) {
      //  for both player and enemy fleets
      for (let num = 0; num < 2; num++) {
        const ships = battleFleets[num];
        const targets = battleFleets[(num + 1) % 2];
        if (targets.length < 1 || ships.length < 1) break;

        ships.forEach(ship => {
          const target = targets[Math.floor(Math.random() * targets.length)];
          ship.modules.forEach(weapon => {
            let damageToDo = weapon.damage;
            //  Damage to shield
            if (target.shield.gt(0)) {
              const shieldPercent = weapon.shieldPercent / 100;
              const maxShieldDamage = damageToDo.times(shieldPercent);
              //  Skip if damage <1% shield
              if (maxShieldDamage.gte(target.shield.div(100))) {
                target.shield = target.shield.minus(maxShieldDamage);
                if (target.shield.lt(0)) {
                  const toDo = damageToDo.plus(target.shield);
                  damageToDo = toDo.div(shieldPercent);
                } else {
                  damageToDo = new Decimal(0);
                }
              } else {
                damageToDo = new Decimal(0);
              }
            }
            //  Damage to Armor
            if (damageToDo.gt(0)) {
              const maxArmorDamage = damageToDo.times(weapon.armorPercent / 100);
              //  Skip if damage < 1% armor
              if (maxArmorDamage.gte(target.armor.div(100))) {
                target.armor = target.armor.minus(maxArmorDamage);
                //  Check explosion
                // console.log(
                //   target.armor.div(target.originalArmor).toNumber() +
                //     " - " +
                //     target.explosionLevel
                // );
                if (
                  target.armor.gt(0) &&
                  target.armor.div(target.originalArmor).toNumber() <
                    target.explosionLevel / 100
                ) {
                  const prob =
                    target.armor.div(target.originalArmor).toNumber() /
                    (target.explosionLevel / 100);
                  // console.log(
                  //   "Expl:" +
                  //     target.armor.toNumber() +
                  //     " " +
                  //     target.originalArmor.toNumber() +
                  //     " " +
                  //     prob
                  // );
                  if (Math.random() < prob) {
                    //  Explode
                    target.armor = new Decimal(-1);
                  }
                }
              }
            }
          });
        });
      }
      //  Remove death ships
      playerShips = playerShips.filter(s => s.armor.gt(0));
      enemyShip = enemyShip.filter(s => s.armor.gt(0));
      battleFleets = [playerShips, enemyShip]; //  just to be sure
    }
    //#endregion
    //#region Return
    const ret = new BattleResult();
    if (enemyShip.length < 1) ret.result = "1";
    const retArr: Array<[ShipData[], Ship[], Array<[string, Decimal]>]> = [
      [input.playerFleet, playerShips, ret.playerLost],
      [input.enemyFleet, enemyShip, ret.enemyLost]
    ];
    retArr.forEach(arr => {
      arr[0].forEach(fl => {
        const alive = arr[1].filter(s => s.id === fl.id).length;
        if (Decimal.fromDecimal(fl.quantity).gt(alive)) {
          arr[2].push([fl.id, Decimal.fromDecimal(fl.quantity).minus(alive)]);
        }
      });
    });

    const diff = input.minTime * 1000 - Date.now() + initial;
    if (diff > 0) {
      // console.log("wait:" + diff);
      setTimeout(() => cb(ret), diff);
    } else {
      cb(ret);
    }
    //#endregion
  }
  onBattleEnd(result: BattleResult): void {
    EnemyManager.getInstance().onBattleEnd(result);
    if (this.em) {
      this.em.updateEmitter.emit(2);
      this.em.battleEndEmitter.emit(1);
    }
  }
}
