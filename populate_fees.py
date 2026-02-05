# populate_fees.py - Run this once to populate fee categories
from app.database import SessionLocal

from app.fee_models import FeeCategory, FeeType

def populate_fees():
    db = SessionLocal()
    
    # Optional filter columns (`audience`, `gender`, `day_kind`, `weekday`, `holes`, `min_age`, `max_age`, `priority`)
    # are used by the backend to auto-select a fee when `fee_category_id` is not provided.
    fees = [
        # GOLF FEES - MEMBERS
        {"code": 1, "description": "GOLF MEMBER MEN - 18 HOLES", "price": 340, "fee_type": FeeType.GOLF, "audience": "member", "gender": "male", "holes": 18},
        {"code": 73, "description": "GOLF MEMBER LADIES - 18 HOLES", "price": 340, "fee_type": FeeType.GOLF, "audience": "member", "gender": "female", "holes": 18},
        {"code": 3, "description": "GOLF MEMBER SCHOLAR - 18 HOLES", "price": 140, "fee_type": FeeType.GOLF, "audience": "member", "holes": 18},
        {"code": 5, "description": "GOLF MEMBER STUDENT - 18 HOLES", "price": 230, "fee_type": FeeType.GOLF, "audience": "member", "holes": 18},
        {"code": 7, "description": "GOLF MEMBER POB MEN (MON FULL DAY + TUES-FRI AM) 18 HOLES", "price": 290, "fee_type": FeeType.GOLF, "audience": "member", "gender": "male", "holes": 18, "day_kind": "weekday", "priority": 5},
        {"code": 74, "description": "GOLF MEMBER POB LADIES (MON FULL DAY + TUES-FRI AM) 18 HOLES", "price": 290, "fee_type": FeeType.GOLF, "audience": "member", "gender": "female", "holes": 18, "day_kind": "weekday", "priority": 5},
        {"code": 10, "description": "JUNIOR ACADEMY 18 HOLES", "price": 100, "fee_type": FeeType.GOLF, "audience": "member", "holes": 18},
        {"code": 12, "description": "CADDIES MONDAY 18 HOLES", "price": 36, "fee_type": FeeType.GOLF, "holes": 18, "weekday": 0, "priority": 10},
        
        # GOLF FEES - MEMBERS 9 HOLES
        {"code": 2, "description": "GOLF MEMBER MEN - 9 HOLES", "price": 220, "fee_type": FeeType.GOLF, "audience": "member", "gender": "male", "holes": 9},
        {"code": 75, "description": "GOLF MEMBER LADIES - 9 HOLES", "price": 220, "fee_type": FeeType.GOLF, "audience": "member", "gender": "female", "holes": 9},
        {"code": 4, "description": "GOLF MEMBER SCHOLAR 9 HOLES", "price": 100, "fee_type": FeeType.GOLF, "audience": "member", "holes": 9},
        {"code": 6, "description": "GOLF MEMBER STUDENT 9 HOLES", "price": 150, "fee_type": FeeType.GOLF, "audience": "member", "holes": 9},
        {"code": 8, "description": "GOLF MEMBER POB MEN (MON FULL DAY + TUES-FRI AM) 9 HOLES", "price": 180, "fee_type": FeeType.GOLF, "audience": "member", "gender": "male", "holes": 9, "day_kind": "weekday", "priority": 5},
        {"code": 76, "description": "GOLF MEMBER POB LADIES (MON FULL DAY + TUES-FRI AM) 9 HOLES", "price": 180, "fee_type": FeeType.GOLF, "audience": "member", "gender": "female", "holes": 9, "day_kind": "weekday", "priority": 5},
        {"code": 9, "description": "JUNIOR ACADEMY 9 HOLES", "price": 74, "fee_type": FeeType.GOLF, "audience": "member", "holes": 9},
        
        # RECIPROCITY
        {"code": 14, "description": "RECIPROCITY (18 HOLES)", "price": 470, "fee_type": FeeType.GOLF, "audience": "reciprocity", "holes": 18},
        {"code": 13, "description": "RECIPROCITY (9 HOLES)", "price": 350, "fee_type": FeeType.GOLF, "audience": "reciprocity", "holes": 9},
        {"code": 16, "description": "RECIPROCITY - SELBORNE 18 HOLES", "price": 360, "fee_type": FeeType.GOLF, "audience": "reciprocity", "holes": 18},
        {"code": 62, "description": "RECIPROCITY - SELBORNE 9 HOLES", "price": 250, "fee_type": FeeType.GOLF, "audience": "reciprocity", "holes": 9},
        
        # VISITORS
        {"code": 36, "description": "VISITOR INTRODUCED/REDUCED", "price": 560, "fee_type": FeeType.GOLF, "audience": "visitor"},
        {"code": 20, "description": "VISITOR - WEEKDAYS 18 HOLES", "price": 575, "fee_type": FeeType.GOLF, "audience": "visitor", "day_kind": "weekday", "holes": 18, "priority": 1},
        {"code": 28, "description": "VISITOR PENSIONER (MON FULL DAY + TUES-FRI AM) 18 HOLES", "price": 360, "fee_type": FeeType.GOLF, "audience": "visitor", "day_kind": "weekday", "holes": 18, "min_age": 60, "priority": 10},
        {"code": 11, "description": "VISITOR SCHOLAR 18 HOLES", "price": 215, "fee_type": FeeType.GOLF, "audience": "visitor", "holes": 18},
        {"code": 33, "description": "VISITOR STUDENT 18 HOLES", "price": 355, "fee_type": FeeType.GOLF, "audience": "visitor", "holes": 18},
        {"code": 34, "description": "S.T.O and RACK RATES", "price": 555, "fee_type": FeeType.GOLF, "audience": "visitor"},
        {"code": 38, "description": "CAPTAIN/CLERGY 18 HOLES", "price": 360, "fee_type": FeeType.GOLF, "audience": "visitor", "holes": 18},
        {"code": 22, "description": "VISITOR - WEEKENDS 18 HOLES", "price": 700, "fee_type": FeeType.GOLF, "audience": "visitor", "day_kind": "weekend", "holes": 18, "priority": 1},
        
        # VISITORS 9 HOLES
        {"code": 29, "description": "VISITOR PENSIONER (MON FULL DAY + TUES-FRI AM) 9 HOLES", "price": 230, "fee_type": FeeType.GOLF, "audience": "visitor", "day_kind": "weekday", "holes": 9, "min_age": 60, "priority": 10},
        {"code": 21, "description": "VISITOR - WEEKDAYS 9 HOLES", "price": 370, "fee_type": FeeType.GOLF, "audience": "visitor", "day_kind": "weekday", "holes": 9, "priority": 1},
        {"code": 37, "description": "CAPTAIN/CLERGY 9 HOLES", "price": 225, "fee_type": FeeType.GOLF, "audience": "visitor", "holes": 9},
        {"code": 25, "description": "ONLINE TEETIMES SUNDAY", "price": 460, "fee_type": FeeType.GOLF, "audience": "visitor", "day_kind": "weekend", "weekday": 6, "priority": 50},
        {"code": 2028, "description": "WEDNESDAY 9 HOLE GREEN FEES", "price": 130, "fee_type": FeeType.GOLF, "audience": "visitor", "day_kind": "weekday", "weekday": 2, "holes": 9, "priority": 50},
        {"code": 24, "description": "WINTER SPECIAL SUNDAY PM (MAY-AUG)", "price": 600, "fee_type": FeeType.GOLF, "audience": "visitor", "day_kind": "weekend", "weekday": 6, "priority": 40},
        {"code": 26, "description": "PMG - GREEN FEES", "price": 270, "fee_type": FeeType.GOLF},
        {"code": 35, "description": "VISITING PROFESSIONALS (18 HOLES)", "price": 341, "fee_type": FeeType.GOLF, "holes": 18},
        
        # NON-AFFILIATED VISITORS
        {"code": 2018, "description": "NON-AFFILIATED VISITOR - WEEKDAYS", "price": 700, "fee_type": FeeType.GOLF, "audience": "non_affiliated", "day_kind": "weekday", "priority": 1},
        {"code": 2017, "description": "NON-AFFILIATED VISITOR - WEEKENDS", "price": 900, "fee_type": FeeType.GOLF, "audience": "non_affiliated", "day_kind": "weekend", "priority": 1},
        {"code": 23, "description": "VISITOR - WEEKENDS 9 HOLES", "price": 490, "fee_type": FeeType.GOLF, "audience": "visitor", "day_kind": "weekend", "holes": 9, "priority": 1},
        {"code": 30, "description": "VISITOR SCHOLAR 9 HOLES", "price": 180, "fee_type": FeeType.GOLF, "audience": "visitor", "holes": 9},
        {"code": 32, "description": "VISITOR STUDENT 9 HOLES", "price": 230, "fee_type": FeeType.GOLF, "audience": "visitor", "holes": 9},
        
        # CARTS FOR MEMBERS
        {"code": 50, "description": "CART 18 HOLES", "price": 400, "fee_type": FeeType.CART, "audience": "member", "holes": 18},
        {"code": 51, "description": "CART 9 HOLES", "price": 270, "fee_type": FeeType.CART, "audience": "member", "holes": 9},
        
        # CART HIRE - NON MEMBER
        {"code": 52, "description": "CART HIRE 18 HOLES", "price": 495, "fee_type": FeeType.CART, "audience": "visitor", "holes": 18},
        {"code": 53, "description": "CART HIRE 9 HOLES", "price": 325, "fee_type": FeeType.CART, "audience": "visitor", "holes": 9},
        {"code": 2029, "description": "WEDNESDAY 9 HOLE CART", "price": 125, "fee_type": FeeType.CART, "day_kind": "weekday", "weekday": 2, "holes": 9, "priority": 50},
        {"code": 71, "description": "PMG - CARTS", "price": 295, "fee_type": FeeType.CART},
        
        # COMPETITION FEES
        {"code": 88, "description": "COMPETITION WEEKDAYS", "price": 85, "fee_type": FeeType.COMPETITION, "day_kind": "weekday"},
        {"code": 94, "description": "LADIES COMP FEE (Thursday)", "price": 50, "fee_type": FeeType.COMPETITION, "day_kind": "weekday", "weekday": 3, "priority": 10},
        {"code": 77, "description": "COMPETITION SATURDAY", "price": 85, "fee_type": FeeType.COMPETITION, "day_kind": "weekend", "weekday": 5, "priority": 10},
        {"code": 101, "description": "FRIDAY MEAT COMP", "price": 60, "fee_type": FeeType.COMPETITION, "day_kind": "weekday", "weekday": 4, "priority": 10},
        {"code": 2012, "description": "TUESDAY SCHOOL", "price": 90, "fee_type": FeeType.COMPETITION, "day_kind": "weekday", "weekday": 1, "priority": 10},
        
        # DRIVING RANGE
        {"code": 68, "description": "FULL BUCKET MEMBER", "price": 70, "fee_type": FeeType.DRIVING_RANGE, "audience": "member"},
        {"code": 67, "description": "HALF BUCKET MEMBER", "price": 55, "fee_type": FeeType.DRIVING_RANGE, "audience": "member"},
        {"code": 66, "description": "FULL BUCKET VISITOR", "price": 85, "fee_type": FeeType.DRIVING_RANGE, "audience": "visitor"},
        {"code": 15, "description": "HALF BUCKET VISITOR", "price": 60, "fee_type": FeeType.DRIVING_RANGE, "audience": "visitor"},
        {"code": 69, "description": "UNLIMITED RANGE BALLS MEMBERS (PER MONTH)", "price": 900, "fee_type": FeeType.DRIVING_RANGE, "audience": "member"},
        {"code": 70, "description": "WARM UP BUCKET", "price": 20, "fee_type": FeeType.DRIVING_RANGE},
        {"code": 100, "description": "A WILKS - BUCKET", "price": 30, "fee_type": FeeType.DRIVING_RANGE},
        
        # OTHER FEES
        {"code": 89, "description": "SCORERS FEE", "price": 300, "fee_type": FeeType.OTHER},
        {"code": 97, "description": "COMP FEES/MEALS CASH CARD", "price": 0, "fee_type": FeeType.OTHER},
        {"code": 201, "description": "FLOOK 2 X BALL", "price": 140, "fee_type": FeeType.OTHER},
        {"code": 202, "description": "FLOOK 4 X BALL", "price": 280, "fee_type": FeeType.OTHER},
    ]
    
    print("Populating fee categories...")
    added = 0
    updated = 0
    for fee_data in fees:
        # Check if exists
        existing = db.query(FeeCategory).filter(FeeCategory.code == fee_data["code"]).first()
        if existing:
            for key, value in fee_data.items():
                if key == "code":
                    continue
                setattr(existing, key, value)
            updated += 1
            print(f"  Updated: {fee_data['code']} - {fee_data['description']} - R{fee_data['price']}")
        else:
            fee = FeeCategory(**fee_data)
            db.add(fee)
            added += 1
            print(f"  Added: {fee_data['code']} - {fee_data['description']} - R{fee_data['price']}")
        
    db.commit()
    print(f"\nOK: {added} added, {updated} updated ({len(fees)} total).")
    db.close()

if __name__ == "__main__":
    populate_fees()
