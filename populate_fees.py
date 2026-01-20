# populate_fees.py - Run this once to populate fee categories
from app.database import SessionLocal
import sys
sys.path.insert(0, '/Users/mulweliramufhuhfhi/fastapi_mysql_app')

from app.fee_models import FeeCategory, FeeType

def populate_fees():
    db = SessionLocal()
    
    fees = [
        # GOLF FEES - MEMBERS
        {"code": 1, "description": "GOLF MEMBER MEN - 18 HOLES", "price": 340, "fee_type": FeeType.GOLF},
        {"code": 73, "description": "GOLF MEMBER LADIES - 18 HOLES", "price": 340, "fee_type": FeeType.GOLF},
        {"code": 3, "description": "GOLF MEMBER SCHOLAR - 18 HOLES", "price": 140, "fee_type": FeeType.GOLF},
        {"code": 5, "description": "GOLF MEMBER STUDENT - 18 HOLES", "price": 230, "fee_type": FeeType.GOLF},
        {"code": 7, "description": "GOLF MEMBER POB MEN (MON FULL DAY + TUES-FRI AM) 18 HOLES", "price": 290, "fee_type": FeeType.GOLF},
        {"code": 74, "description": "GOLF MEMBER POB LADIES (MON FULL DAY + TUES-FRI AM) 18 HOLES", "price": 290, "fee_type": FeeType.GOLF},
        {"code": 10, "description": "JUNIOR ACADEMY 18 HOLES", "price": 100, "fee_type": FeeType.GOLF},
        {"code": 12, "description": "CADDIES MONDAY 18 HOLES", "price": 36, "fee_type": FeeType.GOLF},
        
        # GOLF FEES - MEMBERS 9 HOLES
        {"code": 2, "description": "GOLF MEMBER MEN - 9 HOLES", "price": 220, "fee_type": FeeType.GOLF},
        {"code": 75, "description": "GOLF MEMBER LADIES - 9 HOLES", "price": 220, "fee_type": FeeType.GOLF},
        {"code": 4, "description": "GOLF MEMBER SCHOLAR 9 HOLES", "price": 100, "fee_type": FeeType.GOLF},
        {"code": 6, "description": "GOLF MEMBER STUDENT 9 HOLES", "price": 150, "fee_type": FeeType.GOLF},
        {"code": 8, "description": "GOLF MEMBER POB MEN (MON FULL DAY + TUES-FRI AM) 9 HOLES", "price": 180, "fee_type": FeeType.GOLF},
        {"code": 76, "description": "GOLF MEMBER POB LADIES (MON FULL DAY + TUES-FRI AM) 9 HOLES", "price": 180, "fee_type": FeeType.GOLF},
        {"code": 9, "description": "JUNIOR ACADEMY 9 HOLES", "price": 74, "fee_type": FeeType.GOLF},
        
        # RECIPROCITY
        {"code": 14, "description": "RECIPROCITY (18 HOLES)", "price": 470, "fee_type": FeeType.GOLF},
        {"code": 13, "description": "RECIPROCITY (9 HOLES)", "price": 350, "fee_type": FeeType.GOLF},
        {"code": 16, "description": "RECIPROCITY - SELBORNE 18 HOLES", "price": 360, "fee_type": FeeType.GOLF},
        {"code": 62, "description": "RECIPROCITY - SELBORNE 9 HOLES", "price": 250, "fee_type": FeeType.GOLF},
        
        # VISITORS
        {"code": 36, "description": "VISITOR INTRODUCED/REDUCED", "price": 560, "fee_type": FeeType.GOLF},
        {"code": 20, "description": "VISITOR - WEEKDAYS 18 HOLES", "price": 575, "fee_type": FeeType.GOLF},
        {"code": 28, "description": "VISITOR PENSIONER (MON FULL DAY + TUES-FRI AM) 18 HOLES", "price": 360, "fee_type": FeeType.GOLF},
        {"code": 11, "description": "VISITOR SCHOLAR 18 HOLES", "price": 215, "fee_type": FeeType.GOLF},
        {"code": 33, "description": "VISITOR STUDENT 18 HOLES", "price": 355, "fee_type": FeeType.GOLF},
        {"code": 34, "description": "S.T.O and RACK RATES", "price": 555, "fee_type": FeeType.GOLF},
        {"code": 38, "description": "CAPTAIN/CLERGY 18 HOLES", "price": 360, "fee_type": FeeType.GOLF},
        {"code": 22, "description": "VISITOR - WEEKENDS 18 HOLES", "price": 700, "fee_type": FeeType.GOLF},
        
        # VISITORS 9 HOLES
        {"code": 29, "description": "VISITOR PENSIONER (MON FULL DAY + TUES-FRI AM) 9 HOLES", "price": 230, "fee_type": FeeType.GOLF},
        {"code": 21, "description": "VISITOR - WEEKDAYS 9 HOLES", "price": 370, "fee_type": FeeType.GOLF},
        {"code": 37, "description": "CAPTAIN/CLERGY 9 HOLES", "price": 225, "fee_type": FeeType.GOLF},
        {"code": 25, "description": "ONLINE TEETIMES SUNDAY", "price": 460, "fee_type": FeeType.GOLF},
        {"code": 2028, "description": "WEDNESDAY 9 HOLE GREEN FEES", "price": 130, "fee_type": FeeType.GOLF},
        {"code": 24, "description": "WINTER SPECIAL SUNDAY PM (MAY-AUG)", "price": 600, "fee_type": FeeType.GOLF},
        {"code": 26, "description": "PMG - GREEN FEES", "price": 270, "fee_type": FeeType.GOLF},
        {"code": 35, "description": "VISITING PROFESSIONALS (18 HOLES)", "price": 341, "fee_type": FeeType.GOLF},
        
        # NON-AFFILIATED VISITORS
        {"code": 2018, "description": "NON-AFFILIATED VISITOR - WEEKDAYS", "price": 700, "fee_type": FeeType.GOLF},
        {"code": 2017, "description": "NON-AFFILIATED VISITOR - WEEKENDS", "price": 900, "fee_type": FeeType.GOLF},
        {"code": 23, "description": "VISITOR - WEEKENDS 9 HOLES", "price": 490, "fee_type": FeeType.GOLF},
        {"code": 30, "description": "VISITOR SCHOLAR 9 HOLES", "price": 180, "fee_type": FeeType.GOLF},
        {"code": 32, "description": "VISITOR STUDENT 9 HOLES", "price": 230, "fee_type": FeeType.GOLF},
        
        # CARTS FOR MEMBERS
        {"code": 50, "description": "CART 18 HOLES", "price": 400, "fee_type": FeeType.CART},
        {"code": 51, "description": "CART 9 HOLES", "price": 270, "fee_type": FeeType.CART},
        
        # CART HIRE - NON MEMBER
        {"code": 52, "description": "CART HIRE 18 HOLES", "price": 495, "fee_type": FeeType.CART},
        {"code": 53, "description": "CART HIRE 9 HOLES", "price": 325, "fee_type": FeeType.CART},
        {"code": 2029, "description": "WEDNESDAY 9 HOLE CART", "price": 125, "fee_type": FeeType.CART},
        {"code": 71, "description": "PMG - CARTS", "price": 295, "fee_type": FeeType.CART},
        
        # COMPETITION FEES
        {"code": 88, "description": "COMPETITION WEEKDAYS", "price": 85, "fee_type": FeeType.COMPETITION},
        {"code": 94, "description": "LADIES COMP FEE (Thursday)", "price": 50, "fee_type": FeeType.COMPETITION},
        {"code": 77, "description": "COMPETITION SATURDAY", "price": 85, "fee_type": FeeType.COMPETITION},
        {"code": 101, "description": "FRIDAY MEAT COMP", "price": 60, "fee_type": FeeType.COMPETITION},
        {"code": 2012, "description": "TUESDAY SCHOOL", "price": 90, "fee_type": FeeType.COMPETITION},
        
        # DRIVING RANGE
        {"code": 68, "description": "FULL BUCKET MEMBER", "price": 70, "fee_type": FeeType.DRIVING_RANGE},
        {"code": 67, "description": "HALF BUCKET MEMBER", "price": 55, "fee_type": FeeType.DRIVING_RANGE},
        {"code": 66, "description": "FULL BUCKET VISITOR", "price": 85, "fee_type": FeeType.DRIVING_RANGE},
        {"code": 15, "description": "HALF BUCKET VISITOR", "price": 60, "fee_type": FeeType.DRIVING_RANGE},
        {"code": 69, "description": "UNLIMITED RANGE BALLS MEMBERS (PER MONTH)", "price": 900, "fee_type": FeeType.DRIVING_RANGE},
        {"code": 70, "description": "WARM UP BUCKET", "price": 20, "fee_type": FeeType.DRIVING_RANGE},
        {"code": 100, "description": "A WILKS - BUCKET", "price": 30, "fee_type": FeeType.DRIVING_RANGE},
        
        # OTHER FEES
        {"code": 89, "description": "SCORERS FEE", "price": 300, "fee_type": FeeType.OTHER},
        {"code": 97, "description": "COMP FEES/MEALS CASH CARD", "price": 0, "fee_type": FeeType.OTHER},
        {"code": 201, "description": "FLOOK 2 X BALL", "price": 140, "fee_type": FeeType.OTHER},
        {"code": 202, "description": "FLOOK 4 X BALL", "price": 280, "fee_type": FeeType.OTHER},
    ]
    
    print("Populating fee categories...")
    for fee_data in fees:
        # Check if exists
        existing = db.query(FeeCategory).filter(FeeCategory.code == fee_data["code"]).first()
        if existing:
            print(f"  Skipping code {fee_data['code']} - already exists")
            continue
        
        fee = FeeCategory(**fee_data)
        db.add(fee)
        print(f"  Added: {fee_data['code']} - {fee_data['description']} - R{fee_data['price']}")
    
    db.commit()
    print(f"\n✓ Successfully populated {len(fees)} fee categories!")
    db.close()

if __name__ == "__main__":
    populate_fees()
