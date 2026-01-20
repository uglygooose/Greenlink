#!/usr/bin/env python3
"""
Populate all fee categories from 2026 price list
"""
from app.database import SessionLocal
from app.fee_models import FeeCategory, FeeType

db = SessionLocal()

# All fees from the pricing sheets
fees = [
    # GOLF MEMBER FEES - 18 HOLES
    (1, "Golf Member Men - 18 Holes", 340, FeeType.GOLF),
    (2, "Golf Member Ladies - 18 Holes", 340, FeeType.GOLF),
    (3, "Golf Member Scholar - 18 Holes", 140, FeeType.GOLF),
    (4, "Golf Member Student - 18 Holes", 230, FeeType.GOLF),
    (7, "Golf Member POB Men (Mon Full Day + Tues-Fri AM) 18 Holes", 290, FeeType.GOLF),
    (8, "Golf Member POB Ladies (Mon Full Day + Tues-Fri AM) 18 Holes", 250, FeeType.GOLF),
    (10, "Junior Academy 18 Holes", 100, FeeType.GOLF),
    (11, "Caddies Monday 18 Holes", 30, FeeType.GOLF),
    
    # GOLF MEMBER FEES - 9 HOLES
    (12, "Golf Member Men - 9 Holes", 220, FeeType.GOLF),
    (13, "Golf Member Ladies - 9 Holes", 220, FeeType.GOLF),
    (14, "Golf Member Scholar 9 Holes", 100, FeeType.GOLF),
    (15, "Golf Member Student 9 Holes", 150, FeeType.GOLF),
    (18, "Golf Member POB Men (Mon Full Day + Tues-Fri AM) 9 Holes", 180, FeeType.GOLF),
    (19, "Golf Member POB Ladies (Mon Full Day + Tues-Fri AM) 9 Holes", 180, FeeType.GOLF),
    (21, "Junior Academy 9 Holes", 74, FeeType.GOLF),
    
    # RECIPROCITY FEES
    (22, "Reciprocity (18 Holes)", 470, FeeType.GOLF),
    (23, "Reciprocity (9 Holes)", 350, FeeType.GOLF),
    (24, "Reciprocity - Selborne 18 Holes", 360, FeeType.GOLF),
    (25, "Reciprocity - Selborne 9 Holes", 250, FeeType.GOLF),
    
    # VISITOR FEES - 18 HOLES
    (36, "Visitor Introduced/Reduced", 560, FeeType.GOLF),
    (37, "Complimentary Round", 0, FeeType.GOLF),
    (38, "League Premier Central Alkerton Ladies", 0, FeeType.GOLF),
    (20, "Visitor - Weekdays 18 Holes", 575, FeeType.GOLF),
    (28, "Visitor Pensioner (Mon Full Day + Tues-Fri AM) 18 Holes", 360, FeeType.GOLF),
    (31, "Visitor Scholar 18 Holes", 215, FeeType.GOLF),
    (32, "Visitor Student 18 Holes", 350, FeeType.GOLF),
    (34, "S.T.O and Rack Rates", 555, FeeType.GOLF),
    (35, "Captain/Clergy 18 Holes", 360, FeeType.GOLF),
    (2019, "Visitor - Weekends 18 Holes", 700, FeeType.GOLF),
    
    # VISITOR FEES - 9 HOLES
    (29, "Visitor Pensioner (Mon Full Day + Tues-Fri AM) 9 Holes", 230, FeeType.GOLF),
    (2027, "Visitor - Weekdays 9 Holes", 375, FeeType.GOLF),
    (39, "Captain/Clergy 9 Holes", 225, FeeType.GOLF),
    (40, "Visitor - Weekends 9 Holes", 490, FeeType.GOLF),
    (41, "Visitor Scholar 9 Holes", 130, FeeType.GOLF),
    (42, "Visitor Student 9 Holes", 230, FeeType.GOLF),
    
    # SPECIAL FEES
    (2028, "Online Tee Times Sunday", 460, FeeType.GOLF),
    (43, "Wednesday 9 Hole Green Fees", 130, FeeType.GOLF),
    (44, "Winter Special Sunday PM (May-Aug)", 600, FeeType.GOLF),
    (45, "PMG - Green Fees", 270, FeeType.GOLF),
    (46, "Visiting Professional (18 Holes)", 341, FeeType.GOLF),
    (2018, "Non-affiliated Visitor - Weekdays", 700, FeeType.GOLF),
    (2017, "Non-affiliated Visitor - Weekends", 900, FeeType.GOLF),
    
    # CARTS FOR MEMBERS
    (50, "Cart - 18 Holes", 400, FeeType.CART),
    (51, "Cart - 9 Holes", 270, FeeType.CART),
    
    # TRAIL FEES FOR CARTS
    (52, "Trail Cart - 18 Holes", 495, FeeType.CART),
    (53, "Trail Cart - 9 Holes", 325, FeeType.CART),
    (2029, "Wednesday 9 Hole Cart", 325, FeeType.CART),
    (71, "PMG - Carts", 295, FeeType.CART),
    
    # TRAIL FEES FOR CARTS
    (99, "Annual Trail Fee", 1048, FeeType.OTHER),
    (58, "Trail Fee Member 18 Holes", 77, FeeType.OTHER),
    (57, "Trail Fee Member 9 Holes", 53, FeeType.OTHER),
    (56, "Trail Fee Visitor", 125, FeeType.OTHER),
    
    # DRIVING RANGE
    (68, "Full Bucket Member", 70, FeeType.DRIVING_RANGE),
    (67, "Half Bucket Member", 55, FeeType.DRIVING_RANGE),
    (66, "Full Bucket Visitor", 55, FeeType.DRIVING_RANGE),
    (65, "Half Bucket Visitor", 60, FeeType.DRIVING_RANGE),
    (69, "Unlimited Range Balls Members (Per Month)", 300, FeeType.DRIVING_RANGE),
    (70, "Warm Up Bucket", 20, FeeType.DRIVING_RANGE),
    (73, "5 Wilks Bucket", 25, FeeType.DRIVING_RANGE),
    
    # GREEN FEES FOR GROUPS
    (74, "Schools/Charities Mon-Thur 20-60", 320, FeeType.GOLF),
    (75, "Schools/Charities Mon-Thur 61-120", 365, FeeType.GOLF),
    (76, "Schools/Charities Fri-Sun 20-60", 420, FeeType.GOLF),
    (77, "Schools/Charities Fri-Sun 61-120", 420, FeeType.GOLF),
    (78, "Groups Mon/Fri 20-60", 315, FeeType.GOLF),
    (79, "Groups Mon/Fri 61-120", 315, FeeType.GOLF),
    (80, "Groups Sat AM 20-60", 645, FeeType.GOLF),
    (81, "Groups Sat AM 61-120", 645, FeeType.GOLF),
    (82, "Groups Sun 20-60", 540, FeeType.GOLF),
    (83, "Groups Sun 61-120", 525, FeeType.GOLF),
    
    # BUGGY HIRE
    (88, "Weekdays", 85, FeeType.OTHER),
    (90, "Ladies Comp Fee (Thursday)", 50, FeeType.OTHER),
    (91, "Saturday", 50, FeeType.OTHER),
    (101, "Friday Meat Comp", 60, FeeType.OTHER),
    (2012, "Tuesday School", 40, FeeType.OTHER),
    
    # LIGHTS
    (92, "Member Lights", 86, FeeType.OTHER),
    (93, "Visitor Lights", 190, FeeType.OTHER),
    
    # COURT FEES
    (95, "Visitor Playing With Member", 53, FeeType.OTHER),
    (96, "Court Fee - Per Session (1 Hour)", 210, FeeType.OTHER),
    (97, "Member Lights (If Prepaid Tennis Fees Paid)", 77, FeeType.OTHER),
    (98, "Visitor/Home Owner/Member (No Prepaid Tennis Fees Paid) - Light Fees", 77, FeeType.OTHER),
    (102, "Visitor Ball Fee - Itus/Fri & Sat", 138, FeeType.OTHER),
    (100, "Members Light Card", 86, FeeType.OTHER),
    
    # PREPAID FEES
    (2020, "Prepaid Golf Fees - VET", 22100, FeeType.GOLF),
    (2021, "Prepaid Golf Fees", 22100, FeeType.GOLF),
    (2022, "Prepaid Golf - Scholar U18", 9100, FeeType.GOLF),
    (2023, "Prepaid Golf - Student", 14950, FeeType.GOLF),
    (2024, "Bowls Prepaid Fees", 3610, FeeType.OTHER),
    (592, "Tennis Prepaid Fees", 920, FeeType.OTHER),
    (595, "Tennis Prepaid Fees - Junior", 575, FeeType.OTHER),
    
    # BOWLS FEES
    (2005, "Bowls Member", 58, FeeType.OTHER),
    (2006, "Bowls Visitor", 58, FeeType.OTHER),
    (2007, "Special Bowls", 12, FeeType.OTHER),
    (2008, "Twilight Bowls", 18, FeeType.OTHER),
    (2009, "Bowls Twilight Visitor", 38, FeeType.OTHER),
    (2013, "Bowls Scholar Member", 21, FeeType.OTHER),
]

try:
    for code, description, price, fee_type in fees:
        # Check if exists
        existing = db.query(FeeCategory).filter(
            FeeCategory.description == description
        ).first()
        
        if not existing:
            fee = FeeCategory(
                code=code,
                description=description,
                price=price,
                fee_type=fee_type,
                active=1
            )
            db.add(fee)
            print(f"✓ {description}: R{price}")
        else:
            print(f"- {description} (already exists)")
    
    db.commit()
    print(f"\n✓ All fees populated successfully!")
    
except Exception as e:
    print(f"✗ Error: {e}")
    db.rollback()
finally:
    db.close()
