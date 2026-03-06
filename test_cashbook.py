#!/usr/bin/env python3
"""
Test script for cashbook export functionality
Demonstrates the daily payment collection and Excel export workflow
"""

import requests
import json
from datetime import datetime, date
import sys
import pytest

# Configuration
BASE_URL = "http://localhost:8000"
TODAY = date.today().strftime("%Y-%m-%d")

def print_section(title):
    """Print a formatted section header"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")

def run_daily_summary_test(date_str=None):
    """Test getting daily payment summary"""
    print_section("1. Get Daily Payment Summary")
    
    url = f"{BASE_URL}/cashbook/daily-summary"
    if date_str:
        url += f"?summary_date={date_str}"
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        
        data = response.json()
        print(f"Date: {data.get('date')}")
        print(f"Total Payments: R{data.get('total_payments', 0):,.2f}")
        print(f"Total Tax (VAT): R{data.get('total_tax', 0):,.2f}")
        print(f"Transaction Count: {data.get('transaction_count', 0)}")
        
        # Show first few records
        records = data.get('records', [])
        if records:
            print(f"\nFirst Transaction:")
            record = records[0]
            print(f"  - Player: {record.get('description')}")
            print(f"  - Amount: R{record.get('amount', 0):.2f}")
            print(f"  - Tax: R{record.get('tax_amount', 0):.2f}")
            print(f"  - Account: {record.get('account_number')}")
            print(f"  - Reference: {record.get('reference')}")
        
        return True
    
    except requests.exceptions.ConnectionError:
        print("❌ Error: Cannot connect to server")
        print(f"   Make sure the FastAPI app is running on {BASE_URL}")
        return False
    except requests.exceptions.HTTPError as e:
        print(f"❌ Error: {response.status_code} - {response.text}")
        return False
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

def run_finalize_day_test(date_str=None):
    """Test finalizing day payments"""
    print_section("2. Finalize Day Payments")
    
    url = f"{BASE_URL}/cashbook/finalize-day"
    if date_str:
        url += f"?finalize_date={date_str}"
    
    try:
        response = requests.post(url)
        response.raise_for_status()
        
        data = response.json()
        print(f"Status: {data.get('status')}")
        print(f"Date: {data.get('date')}")
        print(f"Transaction Count: {data.get('transaction_count', 0)}")
        print(f"Total Amount: R{data.get('total_amount', 0):,.2f}")
        print(f"Total Tax: R{data.get('total_tax', 0):,.2f}")
        print(f"\nMessage: {data.get('message')}")
        
        if data.get('export_url'):
            print(f"Export URL: {BASE_URL}{data.get('export_url')}")
        
        return True
    
    except requests.exceptions.ConnectionError:
        print("❌ Error: Cannot connect to server")
        return False
    except requests.exceptions.HTTPError as e:
        print(f"❌ Error: {response.status_code}")
        if response.json().get('detail'):
            print(f"   {response.json().get('detail')}")
        return False
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

def run_export_excel_test(date_str=None):
    """Test exporting to Excel"""
    print_section("3. Export to Excel")
    
    url = f"{BASE_URL}/cashbook/export-excel"
    if date_str:
        url += f"?export_date={date_str}"
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        
        # Save file
        filename = f"cashbook_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        with open(filename, 'wb') as f:
            f.write(response.content)
        
        file_size = len(response.content) / 1024  # KB
        print(f"✅ Excel file exported successfully!")
        print(f"   Filename: {filename}")
        print(f"   Size: {file_size:.2f} KB")
        print(f"\nYou can now open this file with Excel or Google Sheets")
        
        return True
    
    except requests.exceptions.ConnectionError:
        print("❌ Error: Cannot connect to server")
        return False
    except requests.exceptions.HTTPError as e:
        if response.status_code == 404:
            print(f"⚠️  Warning: {response.json().get('detail')}")
            print(f"   (This is normal if there are no bookings for this date)")
        else:
            print(f"❌ Error: {response.status_code}")
        return False
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("  CASHBOOK EXPORT - FUNCTIONALITY TEST")
    print("  Testing daily payment collection and Excel export")
    print("="*60)
    
    # Check if server is running
    print("\n🔍 Checking if FastAPI server is running...")
    try:
        response = requests.get(f"{BASE_URL}/")
        print(f"✅ Server is running at {BASE_URL}\n")
    except:
        print(f"❌ Cannot connect to {BASE_URL}")
        print("\nTo start the server, run:")
        print("  uvicorn app.main:app --reload")
        sys.exit(1)
    
    # Run tests
    print(f"Testing with date: {TODAY}")
    
    # Test 1: Get summary
    success1 = run_daily_summary_test(TODAY)
    
    # Test 2: Finalize day
    success2 = run_finalize_day_test(TODAY)
    
    # Test 3: Export Excel
    success3 = run_export_excel_test(TODAY)


def test_daily_summary():
    if not run_daily_summary_test(TODAY):
        pytest.skip("Cashbook API server not running on localhost:8000")


def test_finalize_day():
    if not run_finalize_day_test(TODAY):
        pytest.skip("Cashbook API server not running on localhost:8000")


def test_export_excel():
    if not run_export_excel_test(TODAY):
        pytest.skip("Cashbook API server not running on localhost:8000")
    
    # Summary
    print_section("Test Summary")
    print(f"Daily Summary: {'✅ PASS' if success1 else '❌ FAIL'}")
    print(f"Finalize Day: {'✅ PASS' if success2 else '❌ FAIL'}")
    print(f"Export Excel: {'✅ PASS' if success3 else '❌ FAIL'}")
    
    if success1 and success2 and success3:
        print("\n✅ All tests passed! Cashbook export is working correctly.")
    else:
        print("\n⚠️  Some tests failed. Check the errors above.")
    
    print("\n" + "="*60)
    print("Quick Reference:")
    print("  Summary: curl http://localhost:8000/cashbook/daily-summary")
    print("  Export:  curl http://localhost:8000/cashbook/export-excel")
    print("  Docs:    http://localhost:8000/docs (Swagger UI)")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()
