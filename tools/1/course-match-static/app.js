/**
 * CourseMatch Assist - Fall 2026 real section data embedded from Excel.
 */

// REAL DATA - sourced from CourseMatch Fall 2026 via Excel file (CourseMatch_Fall2026_AllSections.xlsx)
const REAL_DATA_SECTIONS = [{"sectionId":"ACCT 6110-001","courseId":"ACCT 6110","courseTitle":"Fundamentals of Financial Accounting","days":"MW","time":"8:30a - 9:59a","quarter":"Full","instructor":"Zhou","cu":"1","department":"ACCT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"ACCT 6110-002","courseId":"ACCT 6110","courseTitle":"Fundamentals of Financial Accounting","days":"MW","time":"10:15a - 11:44a","quarter":"Full","instructor":"Zhou","cu":"1","department":"ACCT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"ACCT 6130-001","courseId":"ACCT 6130","courseTitle":"Fundamentals of Financial and Managerial Accounting","days":"TR","time":"8:30a - 9:59a","quarter":"Full","instructor":"Lane","cu":"1","department":"ACCT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"ACCT 6130-002","courseId":"ACCT 6130","courseTitle":"Fundamentals of Financial and Managerial Accounting","days":"TR","time":"10:15a - 11:44a","quarter":"Full","instructor":"Lane","cu":"1","department":"ACCT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"ACCT 6130-003","courseId":"ACCT 6130","courseTitle":"Fundamentals of Financial and Managerial Accounting","days":"TR","time":"10:15a - 11:44a","quarter":"Full","instructor":"Bloomfield","cu":"1","department":"ACCT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"ACCT 6130-004","courseId":"ACCT 6130","courseTitle":"Fundamentals of Financial and Managerial Accounting","days":"TR","time":"1:45p - 3:14p","quarter":"Full","instructor":"Bloomfield","cu":"1","department":"ACCT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"ACCT 7420-401","courseId":"ACCT 7420","courseTitle":"Financial Reporting and Business Analysis","days":"MW","time":"12:00p - 1:29p","quarter":"Full","instructor":"Lambert","cu":"1","department":"ACCT","crossListedAs":"","notes":""},{"sectionId":"ACCT 7420-402","courseId":"ACCT 7420","courseTitle":"Financial Reporting and Business Analysis","days":"MW","time":"1:45p - 3:14p","quarter":"Full","instructor":"Lambert","cu":"1","department":"ACCT","crossListedAs":"","notes":""},{"sectionId":"BEPP 6200-001","courseId":"BEPP 6200","courseTitle":"Behavioral Economics, Markets and Public Policy","days":"MW","time":"1:45p - 3:14p","quarter":"Full","instructor":"Kessler","cu":"1","department":"BEPP","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"BEPP 7640-403","courseId":"BEPP 7640","courseTitle":"Climate and Financial Markets","days":"TR","time":"12:00p - 1:29p","quarter":"Full","instructor":"Van Benthem / Heinle","cu":"1","department":"BEPP","crossListedAs":"ACCT 7640","notes":""},{"sectionId":"BEPP 7640-404","courseId":"BEPP 7640","courseTitle":"Climate and Financial Markets","days":"TR","time":"1:45p - 3:14p","quarter":"Full","instructor":"Van Benthem / Heinle","cu":"1","department":"BEPP","crossListedAs":"ACCT 7640","notes":""},{"sectionId":"BEPP 7720-401","courseId":"BEPP 7720","courseTitle":"Competition Policy","days":"T","time":"3:30p - 6:29p","quarter":"Q1","instructor":"Nevo","cu":"0.5","department":"BEPP","crossListedAs":"LGST 7720","notes":"Miss 1st class = disenrolled"},{"sectionId":"FNCE 6110-001","courseId":"FNCE 6110","courseTitle":"Corporate Finance","days":"TR","time":"8:30a - 9:59a","quarter":"Full","instructor":"Dieckmann","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 6110-002","courseId":"FNCE 6110","courseTitle":"Corporate Finance","days":"TR","time":"10:15a - 11:44a","quarter":"Full","instructor":"Dieckmann","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 6110-003","courseId":"FNCE 6110","courseTitle":"Corporate Finance","days":"TR","time":"1:45p - 3:14p","quarter":"Full","instructor":"Dieckmann","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 6110-004","courseId":"FNCE 6110","courseTitle":"Corporate Finance","days":"TR","time":"3:30p - 4:59p","quarter":"Full","instructor":"Dieckmann","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 6110-005","courseId":"FNCE 6110","courseTitle":"Corporate Finance","days":"MW","time":"10:15a - 11:44a","quarter":"Full","instructor":"Roberts","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 6130-001","courseId":"FNCE 6130","courseTitle":"Macroeconomics and the Global Economic Environment","days":"TR","time":"8:30a - 9:59a","quarter":"Full","instructor":"Landvoigt / Winberry","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 6130-002","courseId":"FNCE 6130","courseTitle":"Macroeconomics and the Global Economic Environment","days":"TR","time":"10:15a - 11:44a","quarter":"Full","instructor":"Landvoigt / Winberry","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 6130-003","courseId":"FNCE 6130","courseTitle":"Macroeconomics and the Global Economic Environment","days":"TR","time":"1:45p - 3:14p","quarter":"Full","instructor":"Landvoigt / Winberry","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7030-001","courseId":"FNCE 7030","courseTitle":"Advanced Corporate Finance","days":"MW","time":"10:15a - 11:44a","quarter":"Full","instructor":"Garrett","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7050-401","courseId":"FNCE 7050","courseTitle":"Investment Management","days":"MW","time":"10:15a - 11:44a","quarter":"Full","instructor":"Van Binsbergen","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7070-001","courseId":"FNCE 7070","courseTitle":"Valuation","days":"TR","time":"1:45p - 3:14p","quarter":"Full","instructor":"Wessels","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7070-002","courseId":"FNCE 7070","courseTitle":"Valuation","days":"TR","time":"3:30p - 4:59p","quarter":"Full","instructor":"Wessels","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7170-401","courseId":"FNCE 7170","courseTitle":"Financial Derivatives","days":"TR","time":"1:45p - 3:14p","quarter":"Full","instructor":"Cuoco","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7170-402","courseId":"FNCE 7170","courseTitle":"Financial Derivatives","days":"TR","time":"3:30p - 4:59p","quarter":"Full","instructor":"Cuoco","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7370-001","courseId":"FNCE 7370","courseTitle":"Data Science for Finance","days":"MW","time":"1:45p - 3:14p","quarter":"Full","instructor":"Dou","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7400-401","courseId":"FNCE 7400","courseTitle":"Central Banks, Macroeconomic Policy and Financial Markets","days":"TR","time":"8:30a - 9:59a","quarter":"Full","instructor":"Eckstein / Gomes","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7400-402","courseId":"FNCE 7400","courseTitle":"Central Banks, Macroeconomic Policy and Financial Markets","days":"TR","time":"10:15a - 11:44a","quarter":"Full","instructor":"Eckstein / Gomes","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7500-001","courseId":"FNCE 7500","courseTitle":"Venture Capital and the Finance of Innovation","days":"TR","time":"10:15a - 11:44a","quarter":"Full","instructor":"Zandberg","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7500-002","courseId":"FNCE 7500","courseTitle":"Venture Capital and the Finance of Innovation","days":"TR","time":"1:45p - 3:14p","quarter":"Full","instructor":"Zandberg","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7510-001","courseId":"FNCE 7510","courseTitle":"The Finance of Buyouts and Acquisitions","days":"TR","time":"8:30a - 9:59a","quarter":"Full","instructor":"Thorburn / Gultekin","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7510-002","courseId":"FNCE 7510","courseTitle":"The Finance of Buyouts and Acquisitions","days":"TR","time":"10:15a - 11:44a","quarter":"Full","instructor":"Thorburn / Gultekin","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7510-003","courseId":"FNCE 7510","courseTitle":"The Finance of Buyouts and Acquisitions","days":"TR","time":"1:45p - 3:14p","quarter":"Full","instructor":"Thorburn / Gultekin","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7530-001","courseId":"FNCE 7530","courseTitle":"Distressed Investing and Value Creation","days":"MW","time":"10:15a - 11:44a","quarter":"Full","instructor":"Kaiser","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 7800-001","courseId":"FNCE 7800","courseTitle":"FinTech","days":"MW","time":"12:00p - 1:29p","quarter":"Q1","instructor":"Staff","cu":"0.5","department":"FNCE","crossListedAs":"","notes":""},{"sectionId":"FNCE 7910-401","courseId":"FNCE 7910","courseTitle":"Corporate Restructuring","days":"M","time":"3:30p - 6:29p","quarter":"Full","instructor":"Sassower / Yilmaz / Sussberg / Geier","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"FNCE 8010-001","courseId":"FNCE 8010","courseTitle":"Advanced Topics in Private Equity","days":"M","time":"5:15p - 8:15p","quarter":"Full","instructor":"Zilberman","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Hybrid."},{"sectionId":"FNCE 8020-001","courseId":"FNCE 8020","courseTitle":"Shareholder Activism","days":"MW","time":"3:30p - 4:59p","quarter":"Full","instructor":"Kaiser","cu":"1","department":"FNCE","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"HCMG 8500-401","courseId":"HCMG 8500","courseTitle":"Health Care Reform and the Future of the American Health Care System","days":"MW","time":"3:30p - 4:59p","quarter":"Full","instructor":"Emanuel","cu":"1","department":"HCMG","crossListedAs":"","notes":""},{"sectionId":"HCMG 8530-001","courseId":"HCMG 8530","courseTitle":"Management and Strategy in Medical Devices and Technology","days":"M","time":"3:30p - 6:29p","quarter":"Full","instructor":"Solomon / Bergman","cu":"1","department":"HCMG","crossListedAs":"","notes":""},{"sectionId":"HCMG 8550-001","courseId":"HCMG 8550","courseTitle":"Management of Health Care for the Elderly","days":"M","time":"7:00p - 9:59p","quarter":"Q1","instructor":"Whitman","cu":"0.5","department":"HCMG","crossListedAs":"","notes":""},{"sectionId":"HCMG 8580-001","courseId":"HCMG 8580","courseTitle":"Health AI: Strategy, Design, and Execution","days":"T","time":"1:45p - 3:14p","quarter":"Full","instructor":"Shenfeld","cu":"0.5","department":"HCMG","crossListedAs":"","notes":""},{"sectionId":"HCMG 8700-001","courseId":"HCMG 8700","courseTitle":"The Business of Behavioral Health","days":"W","time":"10:15a - 11:44a","quarter":"Full","instructor":"Candon","cu":"0.5","department":"HCMG","crossListedAs":"","notes":""},{"sectionId":"HCMG 8770-001","courseId":"HCMG 8770","courseTitle":"Funding Biotech","days":"M","time":"8:30a - 9:59a","quarter":"Full","instructor":"Sapir","cu":"0.5","department":"HCMG","crossListedAs":"","notes":""},{"sectionId":"HCMG 8900-001","courseId":"HCMG 8900","courseTitle":"Advanced Study Project: Management of Health Care Service Businesses","days":"T","time":"3:30p - 6:29p","quarter":"Full","instructor":"Present","cu":"1","department":"HCMG","crossListedAs":"","notes":"Open to 2nd year HCMG majors only"},{"sectionId":"LGST 6110-001","courseId":"LGST 6110","courseTitle":"Responsibility in Global Management","days":"MW","time":"8:30a - 9:59a","quarter":"Q1","instructor":"Friedman","cu":"0.5","department":"LGST","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"LGST 6110-002","courseId":"LGST 6110","courseTitle":"Responsibility in Global Management","days":"MW","time":"8:30a - 9:59a","quarter":"Q2","instructor":"Friedman","cu":"0.5","department":"LGST","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"LGST 6120-001","courseId":"LGST 6120","courseTitle":"Responsibility in Business","days":"W","time":"3:30p - 6:29p","quarter":"Q1","instructor":"Hughes","cu":"0.5","department":"LGST","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"LGST 6120-002","courseId":"LGST 6120","courseTitle":"Responsibility in Business","days":"W","time":"3:30p - 6:29p","quarter":"Q2","instructor":"Hughes","cu":"0.5","department":"LGST","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"LGST 6120-003","courseId":"LGST 6120","courseTitle":"Responsibility in Business","days":"T","time":"3:30p - 6:29p","quarter":"Q1","instructor":"Shell","cu":"0.5","department":"LGST","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"LGST 6120-004","courseId":"LGST 6120","courseTitle":"Responsibility in Business","days":"MW","time":"8:30a - 9:59a","quarter":"Q2","instructor":"Sarachan","cu":"0.5","department":"LGST","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"LGST 6120-006","courseId":"LGST 6120","courseTitle":"Responsibility in Business","days":"MW","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Sarachan","cu":"0.5","department":"LGST","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"LGST 6130-001","courseId":"LGST 6130","courseTitle":"Business, Social Responsibility, and the Environment","days":"TR","time":"10:15a - 11:44a","quarter":"Q1","instructor":"Light","cu":"0.5","department":"LGST","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"LGST 6130-002","courseId":"LGST 6130","courseTitle":"Business, Social Responsibility, and the Environment","days":"TR","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Light","cu":"0.5","department":"LGST","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"LGST 6420-001","courseId":"LGST 6420","courseTitle":"Big Data, Big Responsibilities: Toward Accountable Artificial Intelligence","days":"MW","time":"12:00p - 1:29p","quarter":"Q1","instructor":"Plumb","cu":"0.5","department":"LGST","crossListedAs":"","notes":""},{"sectionId":"LGST 6420-002","courseId":"LGST 6420","courseTitle":"Big Data, Big Responsibilities: Toward Accountable Artificial Intelligence","days":"MW","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Werbach","cu":"0.5","department":"LGST","crossListedAs":"","notes":""},{"sectionId":"LGST 6440-001","courseId":"LGST 6440","courseTitle":"Blockchain and Cryptocurrencies: Business, Legal and Regulatory Considerations","days":"W","time":"3:30p - 6:29p","quarter":"Full","instructor":"Redel","cu":"1","department":"LGST","crossListedAs":"","notes":""},{"sectionId":"LGST 8060-407","courseId":"LGST 8060","courseTitle":"Negotiations","days":"MW","time":"1:45p - 3:14p","quarter":"Full","instructor":"Max","cu":"1","department":"LGST","crossListedAs":"MGMT 6910 / OIDD 6910","notes":"Cannot be taken Pass/Fail"},{"sectionId":"LGST 8060-408","courseId":"LGST 8060","courseTitle":"Negotiations","days":"MW","time":"3:30p - 4:59p","quarter":"Full","instructor":"Max","cu":"1","department":"LGST","crossListedAs":"MGMT 6910 / OIDD 6910","notes":"Cannot be taken Pass/Fail"},{"sectionId":"LGST 8060-409","courseId":"LGST 8060","courseTitle":"Negotiations","days":"T","time":"3:30p - 6:29p","quarter":"Full","instructor":"Bhatia","cu":"1","department":"LGST","crossListedAs":"MGMT 6910 / OIDD 6910","notes":"Cannot be taken Pass/Fail"},{"sectionId":"LGST 8130-001","courseId":"LGST 8130","courseTitle":"Legal and Transactional Aspects of Entrepreneurship","days":"M","time":"3:30p - 6:29p","quarter":"Full","instructor":"Borghese","cu":"1","department":"LGST","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"LGST 8140-401","courseId":"LGST 8140","courseTitle":"International Business Transactions","days":"MW","time":"8:30a - 9:59a","quarter":"Full","instructor":"Nichols","cu":"1","department":"LGST","crossListedAs":"","notes":""},{"sectionId":"MGMT 6110-001","courseId":"MGMT 6110","courseTitle":"Managing Established Enterprises","days":"MW","time":"8:30a - 9:59a","quarter":"Full","instructor":"Pongeluppe / Tranchero / Wilk","cu":"1","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 6110-002","courseId":"MGMT 6110","courseTitle":"Managing Established Enterprises","days":"MW","time":"10:15a - 11:44a","quarter":"Full","instructor":"Pongeluppe / Tranchero / Wilk","cu":"1","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 6110-003","courseId":"MGMT 6110","courseTitle":"Managing Established Enterprises","days":"MW","time":"1:45p - 3:14p","quarter":"Full","instructor":"Pongeluppe / Tranchero / Wilk","cu":"1","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 6120-001","courseId":"MGMT 6120","courseTitle":"Management of Emerging Enterprises","days":"TR","time":"8:30a - 9:59a","quarter":"Full","instructor":"Cameron / Lee / Guillen","cu":"1","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 6120-002","courseId":"MGMT 6120","courseTitle":"Management of Emerging Enterprises","days":"TR","time":"10:15a - 11:44a","quarter":"Full","instructor":"Cameron / Lee / Guillen","cu":"1","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 6120-003","courseId":"MGMT 6120","courseTitle":"Management of Emerging Enterprises","days":"TR","time":"1:45p - 3:14p","quarter":"Full","instructor":"Cameron / Lee / Guillen","cu":"1","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 6240-001","courseId":"MGMT 6240","courseTitle":"Leading Across Cultural and Relational Differences","days":"MW","time":"3:30p - 4:59p","quarter":"Q1","instructor":"Creary","cu":"0.5","department":"MGMT","crossListedAs":"","notes":""},{"sectionId":"MGMT 6240-002","courseId":"MGMT 6240","courseTitle":"Leading Across Cultural and Relational Differences","days":"MW","time":"3:30p - 4:59p","quarter":"Q2","instructor":"Creary","cu":"0.5","department":"MGMT","crossListedAs":"","notes":""},{"sectionId":"MGMT 6250-002","courseId":"MGMT 6250","courseTitle":"Corporate Governance, Executive Compensation and the Board","days":"MW","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Mcdonnell","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 6250-004","courseId":"MGMT 6250","courseTitle":"Corporate Governance, Executive Compensation and the Board","days":"MW","time":"1:45p - 3:14p","quarter":"Q2","instructor":"Mcdonnell","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 6910-411","courseId":"MGMT 6910","courseTitle":"Negotiations","days":"TR","time":"10:15a - 11:44a","quarter":"Full","instructor":"Herrmann","cu":"1","department":"MGMT","crossListedAs":"LGST 8060 / OIDD 6910","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 7010-002","courseId":"MGMT 7010","courseTitle":"Strategy and Competitive Advantage","days":"TR","time":"12:00p - 1:29p","quarter":"Q2","instructor":"Christensen","cu":"0.5","department":"MGMT","crossListedAs":"","notes":""},{"sectionId":"MGMT 7010-004","courseId":"MGMT 7010","courseTitle":"Strategy and Competitive Advantage","days":"TR","time":"1:45p - 3:14p","quarter":"Q2","instructor":"Christensen","cu":"0.5","department":"MGMT","crossListedAs":"","notes":""},{"sectionId":"MGMT 7210-001","courseId":"MGMT 7210","courseTitle":"Corporate Development: Mergers and Acquisitions","days":"MW","time":"12:00p - 1:29p","quarter":"Full","instructor":"Feldman","cu":"1","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 7210-002","courseId":"MGMT 7210","courseTitle":"Corporate Development: Mergers and Acquisitions","days":"MW","time":"1:45p - 3:14p","quarter":"Full","instructor":"Feldman","cu":"1","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 7230-002","courseId":"MGMT 7230","courseTitle":"Strategy and Environmental Sustainability","days":"W","time":"3:30p - 6:29p","quarter":"Q2","instructor":"Staff","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 7310-001","courseId":"MGMT 7310","courseTitle":"Technology Strategy","days":"TR","time":"1:45p - 3:14p","quarter":"Full","instructor":"Conti","cu":"1","department":"MGMT","crossListedAs":"","notes":""},{"sectionId":"MGMT 7400-002","courseId":"MGMT 7400","courseTitle":"Leading Effective Teams","days":"MW","time":"12:00p - 1:29p","quarter":"Q2","instructor":"Staff","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 7720-001","courseId":"MGMT 7720","courseTitle":"Power and Politics in Organizations","days":"T","time":"3:30p - 6:29p","quarter":"Q1","instructor":"Nurmohamed","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 7850-401","courseId":"MGMT 7850","courseTitle":"Geo-Economics: Strategies for an Era of Great Power Rivalry and Political Polarization","days":"M","time":"3:30p - 6:29p","quarter":"Q1","instructor":"El-Erian","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 7860-002","courseId":"MGMT 7860","courseTitle":"Reforming Mass Incarceration and the Role of Business","days":"R","time":"3:30p - 6:29p","quarter":"Q2","instructor":"Phillips","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 7880-401","courseId":"MGMT 7880","courseTitle":"Managing and Competing in China","days":"MW","time":"3:30p - 4:59p","quarter":"Full","instructor":"Abrami","cu":"1","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 7940-002","courseId":"MGMT 7940","courseTitle":"Understanding Careers and Executive Labor Markets","days":"TR","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Bidwell","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 7940-004","courseId":"MGMT 7940","courseTitle":"Understanding Careers and Executive Labor Markets","days":"TR","time":"1:45p - 3:14p","quarter":"Q2","instructor":"Bidwell","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 7940-006","courseId":"MGMT 7940","courseTitle":"Understanding Careers and Executive Labor Markets","days":"TR","time":"3:30p - 4:59p","quarter":"Q2","instructor":"Bidwell","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 8010-001","courseId":"MGMT 8010","courseTitle":"Entrepreneurship","days":"MW","time":"10:15a - 11:44a","quarter":"Q1","instructor":"Piezunka","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 8010-002","courseId":"MGMT 8010","courseTitle":"Entrepreneurship","days":"MW","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Piezunka","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 8040-001","courseId":"MGMT 8040","courseTitle":"Venture Capital and Entrepreneurial Management","days":"MW","time":"10:15a - 11:44a","quarter":"Q1","instructor":"Amit","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 8040-002","courseId":"MGMT 8040","courseTitle":"Venture Capital and Entrepreneurial Management","days":"MW","time":"12:00p - 1:29p","quarter":"Q2","instructor":"Amit","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 8110-001","courseId":"MGMT 8110","courseTitle":"Entrepreneurship Through Acquisition","days":"MW","time":"3:30p - 4:59p","quarter":"Q1","instructor":"Chalfin","cu":"0.5","department":"MGMT","crossListedAs":"","notes":""},{"sectionId":"MGMT 8110-002","courseId":"MGMT 8110","courseTitle":"Entrepreneurship Through Acquisition","days":"MW","time":"3:30p - 4:59p","quarter":"Q2","instructor":"Chalfin","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 8140-001","courseId":"MGMT 8140","courseTitle":"Search Fund Entrepreneurship","days":"TR","time":"12:00p - 1:29p","quarter":"Q1","instructor":"Vesterman / Zreik","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 8310-402","courseId":"MGMT 8310","courseTitle":"Entrepreneurship Launchpad","days":"MW","time":"3:30p - 4:59p","quarter":"Q2","instructor":"Piezunka","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 8330-001","courseId":"MGMT 8330","courseTitle":"Strategies and Practices of Family-controlled Companies","days":"MW","time":"1:45p - 3:14p","quarter":"Q1","instructor":"Amit","cu":"0.5","department":"MGMT","crossListedAs":"","notes":""},{"sectionId":"MGMT 8600-001","courseId":"MGMT 8600","courseTitle":"Immigration and the Global Economy: How Human Movement Affects Firms","days":"MW","time":"3:30p - 4:59p","quarter":"Full","instructor":"Hernandez","cu":"1","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 8710-001","courseId":"MGMT 8710","courseTitle":"Advanced Global Strategy","days":"MW","time":"10:15a - 11:44a","quarter":"Q1","instructor":"Hernandez","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 8710-002","courseId":"MGMT 8710","courseTitle":"Advanced Global Strategy","days":"MW","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Hernandez","cu":"0.5","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MGMT 8880-401","courseId":"MGMT 8880","courseTitle":"Venture Acceleration Lab","days":"W","time":"3:30p - 6:29p","quarter":"Q1","instructor":"Wry","cu":"1","department":"MGMT","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MKTG 6120-002","courseId":"MKTG 6120","courseTitle":"Dynamic Marketing Strategy","days":"MW","time":"8:30a - 9:59a","quarter":"Q2","instructor":"Reed","cu":"0.5","department":"MKTG","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MKTG 6120-004","courseId":"MKTG 6120","courseTitle":"Dynamic Marketing Strategy","days":"MW","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Reed","cu":"0.5","department":"MKTG","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MKTG 6120-006","courseId":"MKTG 6120","courseTitle":"Dynamic Marketing Strategy","days":"TR","time":"8:30a - 9:59a","quarter":"Q2","instructor":"Reed","cu":"0.5","department":"MKTG","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MKTG 6120-008","courseId":"MKTG 6120","courseTitle":"Dynamic Marketing Strategy","days":"TR","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Reed","cu":"0.5","department":"MKTG","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MKTG 7110-001","courseId":"MKTG 7110","courseTitle":"Consumer Behavior","days":"MW","time":"1:45p - 3:14p","quarter":"Full","instructor":"Wilson","cu":"1","department":"MKTG","crossListedAs":"","notes":""},{"sectionId":"MKTG 7120-401","courseId":"MKTG 7120","courseTitle":"Data and Analysis for Marketing Decisions","days":"MW","time":"1:45p - 3:14p","quarter":"Full","instructor":"De La Rosa","cu":"1","department":"MKTG","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"MKTG 7250-001","courseId":"MKTG 7250","courseTitle":"Principles of Retailing","days":"W","time":"3:30p - 6:29p","quarter":"Q1","instructor":"Eshelman","cu":"0.5","department":"MKTG","crossListedAs":"","notes":"Miss 1st class = disenrolled"},{"sectionId":"MKTG 7340-402","courseId":"MKTG 7340","courseTitle":"Augmented Creativity","days":"MW","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Nave","cu":"0.5","department":"MKTG","crossListedAs":"","notes":""},{"sectionId":"MKTG 7340-404","courseId":"MKTG 7340","courseTitle":"Augmented Creativity","days":"MW","time":"1:45p - 3:14p","quarter":"Q2","instructor":"Nave","cu":"0.5","department":"MKTG","crossListedAs":"","notes":""},{"sectionId":"MKTG 7340-406","courseId":"MKTG 7340","courseTitle":"Augmented Creativity","days":"MW","time":"3:30p - 4:59p","quarter":"Q2","instructor":"Nave","cu":"0.5","department":"MKTG","crossListedAs":"","notes":""},{"sectionId":"MKTG 7370-001","courseId":"MKTG 7370","courseTitle":"Applied Neuroscience for Business Decisions","days":"TR","time":"3:30p - 4:59p","quarter":"Q1","instructor":"Platt","cu":"0.5","department":"MKTG","crossListedAs":"","notes":""},{"sectionId":"MKTG 7380-002","courseId":"MKTG 7380","courseTitle":"Consumer Neuroscience","days":"TR","time":"8:30a - 9:59a","quarter":"Q2","instructor":"Nave","cu":"0.5","department":"MKTG","crossListedAs":"","notes":""},{"sectionId":"MKTG 7380-404","courseId":"MKTG 7380","courseTitle":"Consumer Neuroscience","days":"TR","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Nave","cu":"0.5","department":"MKTG","crossListedAs":"","notes":""},{"sectionId":"MKTG 7380-406","courseId":"MKTG 7380","courseTitle":"Consumer Neuroscience","days":"TR","time":"1:45p - 3:14p","quarter":"Q2","instructor":"Nave","cu":"0.5","department":"MKTG","crossListedAs":"","notes":""},{"sectionId":"MKTG 7380-408","courseId":"MKTG 7380","courseTitle":"Consumer Neuroscience","days":"TR","time":"3:30p - 4:59p","quarter":"Q2","instructor":"Nave","cu":"0.5","department":"MKTG","crossListedAs":"","notes":""},{"sectionId":"MKTG 7710-401","courseId":"MKTG 7710","courseTitle":"Models for Marketing Strategy","days":"TR","time":"10:15a - 11:44a","quarter":"Full","instructor":"Van Den Bulte","cu":"1","department":"MKTG","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 5150-401","courseId":"OIDD 5150","courseTitle":"Product Design","days":"M","time":"12:00p - 2:59p","quarter":"Full","instructor":"Marcovitz / Ulrich","cu":"1","department":"OIDD","crossListedAs":"","notes":""},{"sectionId":"OIDD 5150-402","courseId":"OIDD 5150","courseTitle":"Product Design","days":"T","time":"12:00p - 2:59p","quarter":"Full","instructor":"Marcovitz / Ulrich","cu":"1","department":"OIDD","crossListedAs":"","notes":""},{"sectionId":"OIDD 5150-403","courseId":"OIDD 5150","courseTitle":"Product Design","days":"W","time":"12:00p - 2:59p","quarter":"Full","instructor":"Marcovitz / Ulrich","cu":"1","department":"OIDD","crossListedAs":"","notes":""},{"sectionId":"OIDD 5250-001","courseId":"OIDD 5250","courseTitle":"Thinking with Models: Business Analytics for Energy and Sustainability","days":"TR","time":"3:30p - 4:59p","quarter":"Full","instructor":"Kimbrough","cu":"1","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6110-001","courseId":"OIDD 6110","courseTitle":"Quality and Productivity","days":"TR","time":"8:30a - 9:59a","quarter":"Q1","instructor":"Terwiesch","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6110-002","courseId":"OIDD 6110","courseTitle":"Quality and Productivity","days":"TR","time":"8:30a - 9:59a","quarter":"Q2","instructor":"Marinesi","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6110-003","courseId":"OIDD 6110","courseTitle":"Quality and Productivity","days":"TR","time":"10:15a - 11:44a","quarter":"Q1","instructor":"Terwiesch","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6110-004","courseId":"OIDD 6110","courseTitle":"Quality and Productivity","days":"TR","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Marinesi","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6110-006","courseId":"OIDD 6110","courseTitle":"Quality and Productivity","days":"TR","time":"1:45p - 3:14p","quarter":"Q2","instructor":"Marinesi","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6120-002","courseId":"OIDD 6120","courseTitle":"Business Analytics","days":"MW","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Gans","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6120-004","courseId":"OIDD 6120","courseTitle":"Business Analytics","days":"MW","time":"1:45p - 3:14p","quarter":"Q2","instructor":"Gans","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6120-006","courseId":"OIDD 6120","courseTitle":"Business Analytics","days":"TR","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Gans","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6120-008","courseId":"OIDD 6120","courseTitle":"Business Analytics","days":"TR","time":"1:45p - 3:14p","quarter":"Q2","instructor":"Gans","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6140-001","courseId":"OIDD 6140","courseTitle":"Innovation","days":"TR","time":"8:30a - 9:59a","quarter":"Q1","instructor":"Netessine","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6140-003","courseId":"OIDD 6140","courseTitle":"Innovation","days":"TR","time":"10:15a - 11:44a","quarter":"Q1","instructor":"Netessine","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6140-005","courseId":"OIDD 6140","courseTitle":"Innovation","days":"TR","time":"1:45p - 3:14p","quarter":"Q1","instructor":"Netessine","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6140-007","courseId":"OIDD 6140","courseTitle":"Innovation","days":"TR","time":"3:30p - 4:59p","quarter":"Q1","instructor":"Netessine","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6150-001","courseId":"OIDD 6150","courseTitle":"Operations Strategy","days":"MW","time":"8:30a - 9:59a","quarter":"Q1","instructor":"Cachon","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6150-003","courseId":"OIDD 6150","courseTitle":"Operations Strategy","days":"MW","time":"10:15a - 11:44a","quarter":"Q1","instructor":"Cachon","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6590-002","courseId":"OIDD 6590","courseTitle":"Advanced Topics: Supply Chain Analytics","days":"TR","time":"3:30p - 4:59p","quarter":"Q2","instructor":"Willems","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6620-001","courseId":"OIDD 6620","courseTitle":"Enabling Technologies","days":"TR","time":"8:30a - 9:59a","quarter":"Q1","instructor":"Wu","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6620-002","courseId":"OIDD 6620","courseTitle":"Enabling Technologies","days":"TR","time":"8:30a - 9:59a","quarter":"Q2","instructor":"Hosanagar","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6620-003","courseId":"OIDD 6620","courseTitle":"Enabling Technologies","days":"TR","time":"10:15a - 11:44a","quarter":"Q1","instructor":"Wu","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6620-004","courseId":"OIDD 6620","courseTitle":"Enabling Technologies","days":"TR","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Hosanagar","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6620-005","courseId":"OIDD 6620","courseTitle":"Enabling Technologies","days":"TR","time":"1:45p - 3:14p","quarter":"Q1","instructor":"Wu","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6620-006","courseId":"OIDD 6620","courseTitle":"Enabling Technologies","days":"TR","time":"1:45p - 3:14p","quarter":"Q2","instructor":"Hosanagar","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6670-001","courseId":"OIDD 6670","courseTitle":"A.I., Business, and Society","days":"MW","time":"8:30a - 9:59a","quarter":"Q1","instructor":"Meursault","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Miss 1st class = disenrolled"},{"sectionId":"OIDD 6910-401","courseId":"OIDD 6910","courseTitle":"Negotiations","days":"M","time":"3:30p - 6:29p","quarter":"Full","instructor":"Cooney","cu":"1","department":"OIDD","crossListedAs":"LGST 8060 / MGMT 6910","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6910-402","courseId":"OIDD 6910","courseTitle":"Negotiations","days":"TR","time":"1:45p - 3:14p","quarter":"Full","instructor":"Santoro","cu":"1","department":"OIDD","crossListedAs":"LGST 8060 / MGMT 6910","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6910-403","courseId":"OIDD 6910","courseTitle":"Negotiations","days":"TR","time":"3:30p - 4:59p","quarter":"Full","instructor":"Santoro","cu":"1","department":"OIDD","crossListedAs":"LGST 8060 / MGMT 6910","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6920-402","courseId":"OIDD 6920","courseTitle":"Advanced Topics Negotiation","days":"W","time":"3:30p - 6:29p","quarter":"Q2","instructor":"Schweitzer","cu":"0.5","department":"OIDD","crossListedAs":"LGST 6920 / MGMT 6920","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6930-402","courseId":"OIDD 6930","courseTitle":"Influence","days":"MW","time":"8:30a - 9:59a","quarter":"Q2","instructor":"Massey","cu":"0.5","department":"OIDD","crossListedAs":"LGST 6930","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6930-404","courseId":"OIDD 6930","courseTitle":"Influence","days":"MW","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Massey","cu":"0.5","department":"OIDD","crossListedAs":"LGST 6930","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6930-406","courseId":"OIDD 6930","courseTitle":"Influence","days":"MW","time":"1:45p - 3:14p","quarter":"Q2","instructor":"Massey","cu":"0.5","department":"OIDD","crossListedAs":"LGST 6930","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6970-002","courseId":"OIDD 6970","courseTitle":"Retail Supply Chain Management","days":"TR","time":"8:30a - 9:59a","quarter":"Q2","instructor":"Gallino","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"OIDD 6970-004","courseId":"OIDD 6970","courseTitle":"Retail Supply Chain Management","days":"TR","time":"10:15a - 11:44a","quarter":"Q2","instructor":"Gallino","cu":"0.5","department":"OIDD","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"REAL 7050-001","courseId":"REAL 7050","courseTitle":"Global Real Estate: Risk, Politics and Culture","days":"TR","time":"1:45p - 3:14p","quarter":"Full","instructor":"Wong","cu":"1","department":"REAL","crossListedAs":"","notes":""},{"sectionId":"REAL 7210-401","courseId":"REAL 7210","courseTitle":"Real Estate Investment: Analysis and Financing","days":"MW","time":"12:00p - 1:29p","quarter":"Full","instructor":"Calder-Wang","cu":"1","department":"REAL","crossListedAs":"FNCE 7210","notes":""},{"sectionId":"REAL 7210-402","courseId":"REAL 7210","courseTitle":"Real Estate Investment: Analysis and Financing","days":"M","time":"3:30p - 6:29p","quarter":"Full","instructor":"Vickery","cu":"1","department":"REAL","crossListedAs":"FNCE 7210","notes":""},{"sectionId":"REAL 7300-401","courseId":"REAL 7300","courseTitle":"Urban Fiscal Policy","days":"MW","time":"10:15a - 11:44a","quarter":"Full","instructor":"Ferreira","cu":"1","department":"REAL","crossListedAs":"BEPP 7730 / FNCE 7300","notes":"Cannot be taken Pass/Fail"},{"sectionId":"REAL 8040-401","courseId":"REAL 8040","courseTitle":"Real Estate Law","days":"TR","time":"5:15p - 6:44p","quarter":"Full","instructor":"Lebor","cu":"1","department":"REAL","crossListedAs":"LGST 8040","notes":"Cannot be taken Pass/Fail"},{"sectionId":"REAL 8210-401","courseId":"REAL 8210","courseTitle":"Real Estate Development","days":"M","time":"3:30p - 6:29p","quarter":"Full","instructor":"Feldman","cu":"1","department":"REAL","crossListedAs":"","notes":"Requires completion or concurrent enrollment in REAL/FNCE 7210"},{"sectionId":"REAL 8910-401","courseId":"REAL 8910","courseTitle":"Real Estate Entrepreneurship","days":"W","time":"3:30p - 6:29p","quarter":"Q1","instructor":"Shalam","cu":"0.5","department":"REAL","crossListedAs":"","notes":"Cannot be taken Pass/Fail"},{"sectionId":"STAT 7050-001","courseId":"STAT 7050","courseTitle":"Statistical Computing with R","days":"MW","time":"3:30p - 4:59p","quarter":"Q1","instructor":"Zhang","cu":"0.5","department":"STAT","crossListedAs":"","notes":""},{"sectionId":"STAT 7050-002","courseId":"STAT 7050","courseTitle":"Statistical Computing with R","days":"MW","time":"3:30p - 4:59p","quarter":"Q2","instructor":"Zhang","cu":"0.5","department":"STAT","crossListedAs":"","notes":""},{"sectionId":"STAT 7110-401","courseId":"STAT 7110","courseTitle":"Forecasting for Management using Methods of Time Series Analysis","days":"MW","time":"10:15a - 11:44a","quarter":"Full","instructor":"Stine","cu":"1","department":"STAT","crossListedAs":"","notes":""},{"sectionId":"STAT 7220-001","courseId":"STAT 7220","courseTitle":"Predictive Analytics for Business","days":"MW","time":"1:45p - 3:14p","quarter":"Q1","instructor":"Wang","cu":"0.5","department":"STAT","crossListedAs":"","notes":""},{"sectionId":"STAT 7230-001","courseId":"STAT 7230","courseTitle":"Applied Machine Learning in Business","days":"TR","time":"5:15p - 6:44p","quarter":"Full","instructor":"Padmanabhan","cu":"1","department":"STAT","crossListedAs":"","notes":""},{"sectionId":"STAT 7700-401","courseId":"STAT 7700","courseTitle":"Data Analytics and Statistical Computing","days":"MW","time":"1:45p - 3:14p","quarter":"Full","instructor":"Regis","cu":"1","department":"STAT","crossListedAs":"","notes":""},{"sectionId":"STAT 7770-401","courseId":"STAT 7770","courseTitle":"Introduction to Python for Data Science","days":"MW","time":"8:30a - 9:59a","quarter":"Q1","instructor":"Waterman","cu":"0.5","department":"STAT","crossListedAs":"OIDD 7770","notes":""},{"sectionId":"STAT 7770-402","courseId":"STAT 7770","courseTitle":"Introduction to Python for Data Science","days":"MW","time":"8:30a - 9:59a","quarter":"Q2","instructor":"Waterman","cu":"0.5","department":"STAT","crossListedAs":"OIDD 7770","notes":""},{"sectionId":"WHCP 6160-001","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"M","time":"8:30a - 9:59a","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-002","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"M","time":"10:15a - 11:44a","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-003","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"M","time":"12:00p - 1:29p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-004","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"M","time":"1:45p - 3:14p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-005","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"M","time":"3:30p - 4:59p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-006","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"T","time":"8:30a - 9:59a","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-007","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"T","time":"10:15a - 11:44a","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-008","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"T","time":"12:00p - 1:29p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-009","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"T","time":"1:45p - 3:14p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-010","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"T","time":"3:30p - 4:59p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-011","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"W","time":"8:30a - 9:59a","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-012","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"W","time":"10:15a - 11:44a","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-013","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"W","time":"12:00p - 1:29p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-014","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"W","time":"1:45p - 3:14p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-015","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"W","time":"3:30p - 4:59p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-016","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"R","time":"8:30a - 9:59a","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-017","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"R","time":"10:15a - 11:44a","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-018","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"R","time":"12:00p - 1:29p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-019","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"R","time":"1:45p - 3:14p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-020","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"R","time":"3:30p - 4:59p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-021","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"M","time":"5:15p - 6:44p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-022","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"T","time":"5:15p - 6:44p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6160-023","courseId":"WHCP 6160","courseTitle":"Management Communication","days":"W","time":"5:15p - 6:44p","quarter":"Full","instructor":"Staff","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6180-001","courseId":"WHCP 6180","courseTitle":"Entrepreneurial Communication","days":"T","time":"12:00p - 1:29p","quarter":"Full","instructor":"Weiss","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"},{"sectionId":"WHCP 6180-002","courseId":"WHCP 6180","courseTitle":"Entrepreneurial Communication","days":"T","time":"1:45p - 3:14p","quarter":"Full","instructor":"Zod","cu":"0.5","department":"WHCP","crossListedAs":"","notes":"Cannot be taken Pass/Fail. Cohorts A,C,E,G,I,K only"}]
;


/**
 * CourseMatch Assist - application logic (loads after REAL_DATA_SECTIONS).
 * Expects: const REAL_DATA_SECTIONS = [...] from Excel embed.
 */

const { useMemo, useState, useRef, useEffect } = React;

// -----------------------------------------------------------------------------
// MOCK DATA - replace with Track 1 transcript parser output
// -----------------------------------------------------------------------------
const STUDENT_PROFILE = {
  studentId: "MOCK-WG26-0142",
  displayName: "Alex Chen",
  program: "MBA",
  graduationTerm: "Spring 2027",
  completedCourseIds: ["FNCE 6110", "MGMT 6120", "OIDD 6120", "LGST 6120", "MKTG 6120", "MGMT 6110", "STAT 7700"],
  requirementRows: [
    { key: "fixed-core", label: "Fixed core (6 courses)", kind: "complete", detail: "All six fixed core courses satisfied." },
    { key: "major-depth", label: "Major depth electives", kind: "complete", detail: "FNCE depth requirement met." },
    {
      key: "mgmt-half",
      label: "MGMT 0.5 credit (Year 2)",
      kind: "gap",
      detail: "Need one 0.5 cu MGMT offering.",
      fulfillsCourseIds: ["MGMT 7010", "MGMT 8010", "MGMT 8040", "MGMT 7400", "MGMT 7720", "MGMT 8710", "MGMT 7850", "MGMT 6240", "MGMT 6250", "MGMT 7230"],
    },
    {
      key: "non-major-elective",
      label: "Elective outside home department",
      kind: "gap",
      detail: "Need one course primarily outside FNCE.",
      fulfillsCourseIds: ["MKTG 7110", "MKTG 7120", "OIDD 6140", "OIDD 6150", "HCMG 8580", "LGST 8130", "REAL 8210", "BEPP 6200"],
    },
    { key: "stat-analytics", label: "Statistics / analytics", kind: "complete", detail: "STAT 7700 completed." },
  ],
};

// -----------------------------------------------------------------------------
// MOCK DATA - replace with Track 2 historical clearing prices
// -----------------------------------------------------------------------------
const MOCK_CLEARING_PRICES = {
  defaultMedianPoints: 2000,
  byCoursePrefix: [
    { prefix: "FNCE", min: 1800, max: 3200, tier: "competitive" },
    { prefix: "MGMT", min: 1200, max: 2600, tier: "competitive" },
    { prefix: "OIDD", min: 1000, max: 2400, tier: "safe" },
    { prefix: "LGST", min: 800, max: 2000, tier: "safe" },
    { prefix: "MKTG", min: 1400, max: 2800, tier: "competitive" },
    { prefix: "HCMG", min: 900, max: 1900, tier: "safe" },
    { prefix: "STAT", min: 1100, max: 2500, tier: "competitive" },
    { prefix: "ACCT", min: 1300, max: 2700, tier: "competitive" },
    { prefix: "BEPP", min: 1000, max: 2200, tier: "safe" },
    { prefix: "REAL", min: 1200, max: 2600, tier: "competitive" },
    { prefix: "WHCP", min: 500, max: 1500, tier: "reach" },
  ],
};

// -----------------------------------------------------------------------------
// PLACEHOLDER - replace with Track 4 recommendation engine
// -----------------------------------------------------------------------------
function track4BiddingPlaceholder(courseGroup, section, clearingRow) {
  return {
    estimatedBidRange: clearingRow.min + " - " + clearingRow.max + " pts (mock)",
    tier: clearingRow.tier,
    note: "Track 4 engine: combine clearing history, demand, and student strategy.",
  };
}

function lookupClearingRow(courseGroup) {
  if (!courseGroup) return { prefix: "*", min: 900, max: 2200, tier: "competitive" };
  const firstId = courseGroup.displayCourseIds.split(" / ")[0] || "";
  const prefix = firstId.split(" ")[0] || "";
  for (let i = 0; i < MOCK_CLEARING_PRICES.byCoursePrefix.length; i++) {
    const r = MOCK_CLEARING_PRICES.byCoursePrefix[i];
    if (prefix === r.prefix) return r;
  }
  return { prefix: "*", min: 800, max: 2200, tier: "competitive" };
}

const DEPARTMENTS = ["ACCT", "BEPP", "FNCE", "HCMG", "LGST", "MGMT", "MKTG", "OIDD", "REAL", "STAT", "WHCP"];
const CAL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const GRID_START_HOUR = 8;
const GRID_END_HOUR = 21;
const SLOT_MINUTES = 30;
const SLOTS_PER_DAY = ((GRID_END_HOUR - GRID_START_HOUR) * 60) / SLOT_MINUTES;

function parseCrossListIds(crossListedAs) {
  if (!crossListedAs || !String(crossListedAs).trim()) return [];
  return String(crossListedAs)
    .split(/\s*\/\s*/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
}

function buildCrossListClusters(rows) {
  const neighbors = {};
  function add(a, b) {
    if (!neighbors[a]) neighbors[a] = [];
    if (!neighbors[b]) neighbors[b] = [];
    if (neighbors[a].indexOf(b) === -1) neighbors[a].push(b);
    if (neighbors[b].indexOf(a) === -1) neighbors[b].push(a);
  }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cid = r.courseId;
    parseCrossListIds(r.crossListedAs).forEach(function (x) {
      add(cid, x);
    });
    add(cid, cid);
  }
  const visited = {};
  const components = [];
  const ids = Object.keys(neighbors);
  for (let i = 0; i < ids.length; i++) {
    const start = ids[i];
    if (visited[start]) continue;
    const stack = [start];
    const comp = [];
    visited[start] = true;
    while (stack.length) {
      const u = stack.pop();
      comp.push(u);
      const nbr = neighbors[u] || [];
      for (let j = 0; j < nbr.length; j++) {
        const v = nbr[j];
        if (!visited[v]) {
          visited[v] = true;
          stack.push(v);
        }
      }
    }
    comp.sort();
    components.push(comp);
  }
  return components;
}

function parseCu(v) {
  const n = parseFloat(v, 10);
  return isNaN(n) ? 0 : n;
}

function parseTimePart(t) {
  const s = String(t).trim().toLowerCase().replace(/\./g, "");
  const m = s.match(/^(\d{1,2}):(\d{2})\s*([ap])?$/);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3];
  if (ap === "p" && h !== 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  return h * 60 + min;
}

function parseTimeRange(range) {
  const parts = String(range).split(/\s*-\s*/);
  if (parts.length < 2) return { start: 0, end: 0 };
  return { start: parseTimePart(parts[0]), end: parseTimePart(parts[1]) };
}

function expandDays(daysStr) {
  const s = String(daysStr || "").trim().toUpperCase();
  const out = [];
  if (s === "MW") return [0, 2];
  if (s === "TR") return [1, 3];
  if (s === "M") return [0];
  if (s === "T") return [1];
  if (s === "W") return [2];
  if (s === "R") return [3];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "M") out.push(0);
    else if (ch === "T") out.push(1);
    else if (ch === "W") out.push(2);
    else if (ch === "R") out.push(3);
    else if (ch === "F") out.push(4);
  }
  return out.filter(function (d, idx, a) {
    return a.indexOf(d) === idx;
  });
}

function sectionToMeetings(row) {
  const tr = parseTimeRange(row.time);
  const dayIndices = expandDays(row.days);
  const q = String(row.quarter || "Full").trim();
  const meetings = [];
  for (let i = 0; i < dayIndices.length; i++) {
    meetings.push({ day: dayIndices[i], start: tr.start, end: tr.end, quarter: q });
  }
  return meetings;
}

/** Q1 / Q2 = one half-semester each; Full = both halves. Overlap only if both occupy the same half. */
function quarterToSet(q) {
  const u = String(q).trim();
  if (u.toLowerCase() === "full") return { Q1: true, Q2: true };
  if (u === "Q1") return { Q1: true };
  if (u === "Q2") return { Q2: true };
  return { Q1: true, Q2: true };
}

function quartersConflict(q1, q2) {
  const A = quarterToSet(q1);
  const B = quarterToSet(q2);
  return !!(A.Q1 && B.Q1) || !!(A.Q2 && B.Q2);
}

function meetingBlocksOverlap(m1, m2) {
  if (m1.day !== m2.day) return false;
  if (!quartersConflict(m1.quarter, m2.quarter)) return false;
  return m1.start < m2.end && m1.end > m2.start;
}

function sectionAllMeetings(section) {
  return section.meetings || [];
}

function sectionsTimeConflict(a, b) {
  const ma = sectionAllMeetings(a);
  const mb = sectionAllMeetings(b);
  for (let i = 0; i < ma.length; i++) {
    for (let j = 0; j < mb.length; j++) {
      if (meetingBlocksOverlap(ma[i], mb[j])) return true;
    }
  }
  return false;
}

function blockedIntervalsFromCells(cellKeys) {
  const list = [];
  cellKeys.forEach(function (key) {
    const parts = key.split("-");
    const d = parseInt(parts[0], 10);
    const slot = parseInt(parts[1], 10);
    const start = GRID_START_HOUR * 60 + slot * SLOT_MINUTES;
    const end = start + SLOT_MINUTES;
    list.push({ day: d, start: start, end: end, quarter: "Full" });
  });
  return list;
}

function sectionConflictsBlocked(section, blockedIntervals) {
  const ms = sectionAllMeetings(section);
  for (let i = 0; i < ms.length; i++) {
    for (let j = 0; j < blockedIntervals.length; j++) {
      const b = blockedIntervals[j];
      if (ms[i].day !== b.day) continue;
      if (!quartersConflict(ms[i].quarter, b.quarter)) continue;
      if (ms[i].start < b.end && ms[i].end > b.start) return true;
    }
  }
  return false;
}

function clusterContaining(clusters, courseId) {
  for (let i = 0; i < clusters.length; i++) {
    if (clusters[i].indexOf(courseId) !== -1) return clusters[i].slice();
  }
  return [courseId];
}

function buildCourseCatalogFromExcel(rows) {
  const clusters = buildCrossListClusters(rows);
  const idToGroupKey = {};
  for (let i = 0; i < clusters.length; i++) {
    const key = clusters[i].join("|");
    for (let j = 0; j < clusters[i].length; j++) {
      idToGroupKey[clusters[i][j]] = key;
    }
  }
  const groups = {};
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const gk = idToGroupKey[raw.courseId] || raw.courseId;
    if (!groups[gk]) {
      groups[gk] = {
        groupKey: gk,
        courseIds: [],
        displayCourseIds: "",
        title: raw.courseTitle,
        cu: parseCu(raw.cu),
        departments: [],
        sections: [],
        notesSamples: [],
      };
    }
    const g = groups[gk];
    if (g.courseIds.indexOf(raw.courseId) === -1) g.courseIds.push(raw.courseId);
    if (raw.notes && g.notesSamples.indexOf(raw.notes) === -1 && g.notesSamples.length < 3) g.notesSamples.push(raw.notes);
    if (g.departments.indexOf(raw.department) === -1) g.departments.push(raw.department);
    const sectionObj = {
      sectionId: raw.sectionId,
      courseId: raw.courseId,
      courseTitle: raw.courseTitle,
      days: raw.days,
      time: raw.time,
      quarter: raw.quarter,
      instructor: raw.instructor,
      cu: parseCu(raw.cu),
      department: raw.department,
      meetings: sectionToMeetings(raw),
    };
    g.sections.push(sectionObj);
  }
  Object.keys(groups).forEach(function (k) {
    const g = groups[k];
    const comp = clusterContaining(clusters, g.courseIds[0]);
    g.courseIds = comp.slice().sort();
    g.displayCourseIds = g.courseIds.join(" / ");
    const deptSet = {};
    for (let d = 0; d < g.departments.length; d++) {
      deptSet[g.departments[d]] = true;
    }
    for (let c = 0; c < comp.length; c++) {
      const prefix = comp[c].split(" ")[0];
      if (DEPARTMENTS.indexOf(prefix) !== -1) deptSet[prefix] = true;
    }
    g.departments = Object.keys(deptSet).sort();
  });
  const catalog = Object.keys(groups).map(function (k) {
    return groups[k];
  });
  catalog.forEach(function (g) {
    let maxCu = 0;
    for (let i = 0; i < g.sections.length; i++) {
      if (g.sections[i].cu > maxCu) maxCu = g.sections[i].cu;
    }
    if (maxCu > 0) g.cu = maxCu;
  });
  catalog.sort(function (a, b) {
    return a.displayCourseIds.localeCompare(b.displayCourseIds);
  });
  return catalog;
}

function courseGroupFillsGapLabels(courseGroup) {
  const hits = [];
  const rows = STUDENT_PROFILE.requirementRows || [];
  const hayIds = courseGroup.courseIds.join(" ");
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.kind !== "gap" || !r.fulfillsCourseIds) continue;
    const list = r.fulfillsCourseIds;
    for (let j = 0; j < list.length; j++) {
      const fid = list[j];
      if (hayIds.indexOf(fid) !== -1) {
        hits.push(r.label);
        break;
      }
    }
  }
  return hits;
}

function countGapsFilledBySchedule(chosenSections) {
  const chosenIds = {};
  chosenSections.forEach(function (sec) {
    chosenIds[sec.courseId] = true;
  });
  let count = 0;
  const rows = STUDENT_PROFILE.requirementRows || [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.kind !== "gap" || !r.fulfillsCourseIds) continue;
    const list = r.fulfillsCourseIds;
    let filled = false;
    for (let j = 0; j < list.length; j++) {
      if (chosenIds[list[j]]) {
        filled = true;
        break;
      }
    }
    if (filled) count++;
  }
  return count;
}

function priorityWeight(p) {
  if (p === "high") return 3;
  if (p === "low") return 1;
  return 2;
}

/** High first, then medium, then low; preserves drag order within each tier. */
function partitionShortlistForScheduler(list) {
  const h = [];
  const m = [];
  const l = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i].priority;
    if (p === "high") h.push(list[i]);
    else if (p === "low") l.push(list[i]);
    else m.push(list[i]);
  }
  return h.concat(m).concat(l);
}

function schedulePriorityScore(orderedShortlist, chosenSections) {
  const byGk = {};
  chosenSections.forEach(function (s) {
    for (let i = 0; i < orderedShortlist.length; i++) {
      if (orderedShortlist[i].courseGroup.courseIds.indexOf(s.courseId) !== -1) {
        byGk[orderedShortlist[i].courseGroup.groupKey] = s;
        break;
      }
    }
  });
  let score = 0;
  for (let i = 0; i < orderedShortlist.length; i++) {
    const item = orderedShortlist[i];
    if (!byGk[item.courseGroup.groupKey]) continue;
    score += priorityWeight(item.priority) * (orderedShortlist.length - i);
  }
  return score;
}

function mediumLowIncludedCounts(partitioned, chosen) {
  let medium = 0;
  let low = 0;
  for (let i = 0; i < partitioned.length; i++) {
    const item = partitioned[i];
    const g = item.courseGroup;
    const hit = chosen.some(function (s) {
      return g.courseIds.indexOf(s.courseId) !== -1;
    });
    if (!hit) continue;
    if (item.priority === "medium") medium++;
    else if (item.priority === "low") low++;
  }
  return { medium: medium, low: low };
}

function cuAcceptableBand(sol, targetCu) {
  const d = Math.abs(sol.totalCu - targetCu);
  if (d < 0.06) return 0;
  if (d <= 0.55) return 1;
  if (d <= 1.05) return 2;
  return 3 + d;
}

function totalCuFromChosenSections(orderedShortlist, chosen) {
  let t = 0;
  for (let i = 0; i < orderedShortlist.length; i++) {
    const g = orderedShortlist[i].courseGroup;
    const hit = chosen.some(function (s) {
      return g.courseIds.indexOf(s.courseId) !== -1;
    });
    if (hit) t += g.cu;
  }
  return t;
}

/**
 * Scheduler: list is partitioned [all high][all medium][all low] (drag order within tier).
 * High: MUST pick exactly one feasible section (no skip). Medium/low: skip or one section.
 * Blocked times: strict via sectionConflictsBlocked + Full-quarter blocks vs section meetings.
 * Quarter overlap: Q1 vs Q2 same clock do not conflict; Full overlaps Q1 and Q2.
 * Ranks: CU band (exact, then ~0.5 off), distance, gaps filled, more medium, fewer low.
 */
function findViableSchedules(orderedShortlist, blockedCellKeys, targetCu, maxSolutions) {
  const blocked = blockedIntervalsFromCells(blockedCellKeys);
  const solutions = [];
  const partitioned = partitionShortlistForScheduler(orderedShortlist);
  const n = partitioned.length;
  if (n === 0) return solutions;

  const MAX_RAW = Math.max(25000, maxSolutions * 500);

  function dfs(idx, chosen) {
    if (solutions.length >= MAX_RAW) return;
    if (idx === n) {
      if (chosen.length === 0) return;
      const cu = totalCuFromChosenSections(partitioned, chosen);
      const ml = mediumLowIncludedCounts(partitioned, chosen);
      solutions.push({
        sections: chosen.slice(),
        totalCu: cu,
        gapsFilled: countGapsFilledBySchedule(chosen),
        priorityScore: schedulePriorityScore(partitioned, chosen),
        mediumCount: ml.medium,
        lowCount: ml.low,
      });
      return;
    }

    const item = partitioned[idx];
    const isHigh = item.priority === "high";
    const secs = item.courseGroup.sections;

    for (let s = 0; s < secs.length; s++) {
      const sec = secs[s];
      if (sectionConflictsBlocked(sec, blocked)) continue;
      let ok = true;
      for (let c = 0; c < chosen.length; c++) {
        if (sectionsTimeConflict(sec, chosen[c])) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      chosen.push(sec);
      dfs(idx + 1, chosen);
      chosen.pop();
      if (solutions.length >= MAX_RAW) return;
    }

    if (!isHigh) {
      dfs(idx + 1, chosen);
    }
  }
  dfs(0, []);

  function cuGap(sol) {
    return Math.abs(sol.totalCu - targetCu);
  }

  solutions.sort(function (a, b) {
    const bandA = cuAcceptableBand(a, targetCu);
    const bandB = cuAcceptableBand(b, targetCu);
    if (bandA !== bandB) return bandA - bandB;
    const gA = cuGap(a);
    const gB = cuGap(b);
    if (Math.abs(gA - gB) > 0.02) return gA - gB;
    if (b.gapsFilled !== a.gapsFilled) return b.gapsFilled - a.gapsFilled;
    if (b.mediumCount !== a.mediumCount) return b.mediumCount - a.mediumCount;
    if (a.lowCount !== b.lowCount) return a.lowCount - b.lowCount;
    var underA = a.totalCu <= targetCu + 0.02;
    var underB = b.totalCu <= targetCu + 0.02;
    if (underA !== underB) return underA ? -1 : 1;
    return b.priorityScore - a.priorityScore;
  });

  const out = [];
  const seenSig = {};
  for (let i = 0; i < solutions.length && out.length < maxSolutions; i++) {
    const sig = solutions[i].sections
      .map(function (s) {
        return s.sectionId;
      })
      .sort()
      .join(",");
    if (seenSig[sig]) continue;
    seenSig[sig] = true;
    out.push(solutions[i]);
  }
  return out;
}

function explainScheduleFailure(orderedShortlist, blockedCellKeys, targetCu) {
  if (!orderedShortlist.length) return "Shortlist is empty. Add courses on the previous step.";
  const blocked = blockedIntervalsFromCells(blockedCellKeys);
  const partitioned = partitionShortlistForScheduler(orderedShortlist);
  const highs = partitioned.filter(function (item) {
    return item.priority === "high";
  });

  for (let i = 0; i < highs.length; i++) {
    const g = highs[i].courseGroup;
    let anyClear = false;
    for (let s = 0; s < g.sections.length; s++) {
      if (!sectionConflictsBlocked(g.sections[s], blocked)) {
        anyClear = true;
        break;
      }
    }
    if (!anyClear) {
      return (
        "All sections of " +
        g.displayCourseIds +
        " (" +
        g.title +
        ") overlap your blocked times. Relax those blocks or change your availability."
      );
    }
  }

  if (highs.length > 0) {
    let highsOk = false;
    function dfsHigh(i, chosen) {
      if (highsOk) return;
      if (i === highs.length) {
        highsOk = true;
        return;
      }
      const secs = highs[i].courseGroup.sections;
      for (let s = 0; s < secs.length; s++) {
        const sec = secs[s];
        if (sectionConflictsBlocked(sec, blocked)) continue;
        let ok = true;
        for (let c = 0; c < chosen.length; c++) {
          if (sectionsTimeConflict(sec, chosen[c])) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        chosen.push(sec);
        dfsHigh(i + 1, chosen);
        chosen.pop();
        if (highsOk) return;
      }
    }
    dfsHigh(0, []);
    if (!highsOk) {
      return (
        "Your high-priority courses have no combination of sections that fit together without time overlaps (Q1 vs Q2 at the same clock time is allowed). Try different sections or change which courses are marked High."
      );
    }
  }

  if (highs.length > 0) {
    return (
      "No ranked schedule matched your target of about " +
      targetCu +
      " CU while including every high-priority course and staying conflict-free. Try target CU, blocks, or moving a course from High to Medium."
    );
  }
  return "No viable schedule was built from your shortlist with these blocks (for example, every section of a course may be unavailable). Adjust availability or the shortlist.";
}

function buildSectionColorMap(sections) {
  const paletteN = 6;
  const map = {};
  let next = 0;
  for (let i = 0; i < sections.length; i++) {
    const id = sections[i].sectionId;
    if (map[id] === undefined) {
      map[id] = next % paletteN;
      next++;
    }
  }
  return map;
}

function WizardNav(props) {
  const el = React.createElement;
  const step = props.step;
  return el(
    "nav",
    { className: "wizard-nav" },
    el("span", { className: step === 1 ? "wizard-step active" : "wizard-step" }, "1. Courses"),
    el("span", { className: "wizard-arrow" }, "→"),
    el("span", { className: step === 2 ? "wizard-step active" : "wizard-step" }, "2. Availability"),
    el("span", { className: "wizard-arrow" }, "→"),
    el("span", { className: step === 3 ? "wizard-step active" : "wizard-step" }, "3. Results"),
  );
}

function StudentProfilePanel() {
  const el = React.createElement;
  const rows = STUDENT_PROFILE.requirementRows || [];
  return el(
    "div",
    { className: "profile-panel" },
    el("h3", { className: "profile-heading" }, "Student profile"),
    el("p", { className: "profile-meta" }, STUDENT_PROFILE.displayName + " · " + STUDENT_PROFILE.studentId),
    el(
      "ul",
      { className: "req-list" },
      rows.map(function (r) {
        return el(
          "li",
          { key: r.key, className: "req-item " + (r.kind === "gap" ? "req-gap" : "req-ok") },
          el("span", { className: "req-badge" }, r.kind === "gap" ? "Gap" : "OK"),
          el("span", { className: "req-label" }, r.label),
          el("span", { className: "req-detail" }, r.detail),
        );
      }),
    ),
  );
}

function PagePickerCalendar(props) {
  const el = React.createElement;
  const blockedCells = props.blockedCells;
  const setBlockedCells = props.setBlockedCells;
  const dragging = useRef(false);
  const paintBlocking = useRef(true);
  useEffect(
    function () {
      function onUp() {
        dragging.current = false;
      }
      window.addEventListener("mouseup", onUp);
      return function () {
        window.removeEventListener("mouseup", onUp);
      };
    },
    [],
  );
  const slotLabels = [];
  for (let s = 0; s < SLOTS_PER_DAY; s++) {
    const minutes = GRID_START_HOUR * 60 + s * SLOT_MINUTES;
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    slotLabels.push(hh + ":" + (mm < 10 ? "0" : "") + mm);
  }
  function toggleCell(d, slot, forceBlock) {
    const key = d + "-" + slot;
    setBlockedCells(function (prev) {
      const next = new Set(prev);
      const block = forceBlock !== undefined ? forceBlock : !next.has(key);
      if (block) next.add(key);
      else next.delete(key);
      return next;
    });
  }
  const rows = CAL_DAYS.map(function (day, dIdx) {
    return el(
      "div",
      { key: day, className: "cal-row" },
      el("div", { className: "cal-day-label" }, day.slice(0, 3)),
      el(
        "div",
        { className: "cal-slots" },
        slotLabels.map(function (_, slot) {
          const key = dIdx + "-" + slot;
          const on = blockedCells.has(key);
          return el("div", {
            key: key,
            className: "cal-cell" + (on ? " blocked" : ""),
            onMouseDown: function () {
              dragging.current = true;
              paintBlocking.current = !on;
              toggleCell(dIdx, slot, paintBlocking.current);
            },
            onMouseEnter: function () {
              if (!dragging.current) return;
              toggleCell(dIdx, slot, paintBlocking.current);
            },
          });
        }),
      ),
    );
  });
  return el(
    "div",
    { className: "calendar-picker" },
    el(
      "div",
      { className: "cal-time-ruler" },
      el("div", { className: "cal-day-spacer" }),
      el(
        "div",
        { className: "cal-time-labels" },
        slotLabels.map(function (lab, i) {
          return el("span", { key: i, className: "time-tick" }, lab);
        }),
      ),
    ),
    el("div", { className: "calendar-grid-wrap" }, rows),
  );
}

function formatPlannerTimeRow(slotIndex) {
  const minutes = GRID_START_HOUR * 60 + slotIndex * SLOT_MINUTES;
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const ampm = hh < 12 ? "am" : "pm";
  return h12 + ":" + (mm < 10 ? "0" : "") + mm + ampm;
}

/** Days as columns (Mon-Fri), time as rows (8am top -> 9pm bottom). */
function WeeklyPlannerGrid(props) {
  const el = React.createElement;
  const sections = props.sections || [];
  const colorMap = props.sectionColorMap || {};
  const isModal = !!props.isModal;
  const nSlots = SLOTS_PER_DAY;
  const nDays = 5;
  const cover = [];
  for (let s = 0; s < nSlots; s++) {
    cover[s] = [];
    for (let d = 0; d < nDays; d++) {
      cover[s][d] = null;
    }
  }
  sections.forEach(function (sec) {
    const hue = colorMap[sec.sectionId] != null ? colorMap[sec.sectionId] : 0;
    (sec.meetings || []).forEach(function (m) {
      const d = m.day;
      if (d < 0 || d > 4) return;
      const slot0 = Math.max(0, Math.floor((m.start - GRID_START_HOUR * 60) / SLOT_MINUTES));
      const slot1 = Math.min(nSlots - 1, Math.ceil((m.end - GRID_START_HOUR * 60) / SLOT_MINUTES) - 1);
      const block = {
        courseId: sec.courseId,
        hue: hue,
        startSlot: slot0,
        endSlot: slot1,
        sectionId: sec.sectionId,
      };
      for (let slot = slot0; slot <= slot1; slot++) {
        cover[slot][d] = block;
      }
    });
  });

  const rowHeight = isModal ? "minmax(20px, 1fr)" : "minmax(18px, 1fr)";
  const gridStyle = {
    gridTemplateColumns: "72px repeat(5, minmax(0, 1fr))",
    gridTemplateRows: "auto repeat(" + nSlots + ", " + rowHeight + ")",
  };

  const header = [
    el(
      "div",
      { key: "corner", className: "planner-corner", style: { gridColumn: 1, gridRow: 1 } },
      "Time",
    ),
  ].concat(
    CAL_DAYS.map(function (day, i) {
      return el(
        "div",
        {
          key: "hd-" + i,
          className: "planner-day-head",
          style: { gridColumn: i + 2, gridRow: 1 },
        },
        day,
      );
    }),
  );

  const body = [];
  for (let s = 0; s < nSlots; s++) {
    body.push(
      el(
        "div",
        {
          key: "time-" + s,
          className: "planner-time-cell",
          style: { gridColumn: 1, gridRow: s + 2 },
        },
        formatPlannerTimeRow(s),
      ),
    );
    for (let d = 0; d < nDays; d++) {
      const b = cover[s][d];
      if (!b) {
        body.push(
          el("div", {
            key: "empty-" + s + "-" + d,
            className: "planner-slot-empty",
            style: { gridColumn: d + 2, gridRow: s + 2 },
          }),
        );
      } else if (b.startSlot === s) {
        const sp = b.endSlot - b.startSlot + 1;
        body.push(
          el(
            "div",
            {
              key: "block-" + s + "-" + d,
              className: "planner-block cal-hue-light-" + (b.hue % 6),
              style: { gridColumn: d + 2, gridRow: s + 2 + " / span " + sp },
            },
            el("span", { className: "planner-block-id" }, b.courseId),
          ),
        );
      }
    }
  }

  return el(
    "div",
    { className: "planner-outer" },
    el(
      "div",
      {
        className: "planner-grid" + (isModal ? " planner-grid--modal" : ""),
        style: gridStyle,
      },
      header.concat(body),
    ),
  );
}

function ScheduleCourseLegend(props) {
  const el = React.createElement;
  const sections = props.sections || [];
  const colorMap = props.sectionColorMap || {};
  const seen = {};
  const rows = [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (seen[sec.sectionId]) continue;
    seen[sec.sectionId] = true;
    const hue = colorMap[sec.sectionId] != null ? colorMap[sec.sectionId] : 0;
    const meta =
      sec.courseId +
      " · " +
      sec.sectionId +
      " · " +
      sec.instructor +
      " · " +
      sec.days +
      " " +
      sec.time +
      " · " +
      sec.cu +
      " CU · " +
      sec.quarter;
    rows.push(
      el(
        "div",
        { key: sec.sectionId, className: "legend-row" },
        el("span", { className: "legend-swatch cal-hue-light-" + (hue % 6), "aria-hidden": true }),
        el(
          "div",
          { className: "legend-body" },
          el("div", { className: "legend-title-line" }, sec.courseTitle),
          el("div", { className: "legend-meta" }, meta),
        ),
      ),
    );
  }
  return el(
    "div",
    { className: "course-legend" },
    el("div", { className: "legend-heading" }, "Courses in this schedule"),
    rows,
  );
}

function ScheduleOptionCard(props) {
  const el = React.createElement;
  const sol = props.sol;
  const idx = props.optionIndex;
  const summary = props.summary;
  const colorMap = props.sectionColorMap;
  const [expanded, setExpanded] = useState(false);

  useEffect(
    function () {
      if (!expanded) return;
      function onKey(e) {
        if (e.key === "Escape") setExpanded(false);
      }
      window.addEventListener("keydown", onKey);
      return function () {
        window.removeEventListener("keydown", onKey);
      };
    },
    [expanded],
  );

  const legendProps = { sections: sol.sections, sectionColorMap: colorMap };
  const gridPropsBase = { sections: sol.sections, sectionColorMap: colorMap };
  const legendInline = el(ScheduleCourseLegend, Object.assign({ key: "legend-inline" }, legendProps));
  const legendModal = el(ScheduleCourseLegend, Object.assign({ key: "legend-modal" }, legendProps));
  const gridInline = el(WeeklyPlannerGrid, Object.assign({ key: "grid-inline", isModal: false }, gridPropsBase));
  const gridModal = el(WeeklyPlannerGrid, Object.assign({ key: "grid-modal", isModal: true }, gridPropsBase));

  const modalPlanner =
    expanded &&
    el(
      "div",
      {
        className: "schedule-modal-backdrop",
        role: "dialog",
        "aria-modal": true,
        "aria-labelledby": "schedule-modal-title-" + idx,
        onClick: function () {
          setExpanded(false);
        },
      },
      el(
        "div",
        {
          className: "schedule-modal",
          onClick: function (e) {
            e.stopPropagation();
          },
        },
        el(
          "div",
          { className: "schedule-modal-toolbar" },
          el(
            "h3",
            { id: "schedule-modal-title-" + idx, className: "schedule-modal-title" },
            "Option " + (idx + 1),
          ),
          el(
            "button",
            {
              type: "button",
              className: "btn-secondary schedule-modal-close",
              onClick: function () {
                setExpanded(false);
              },
            },
            "Close",
          ),
        ),
        el("div", { className: "schedule-modal-body" }, legendModal, gridModal),
      ),
    );

  return el(
    "div",
    { className: "schedule-option-card" },
    el(
      "div",
      { className: "schedule-option-head" },
      el("h4", { className: "schedule-option-label" }, "Option " + (idx + 1)),
      el(
        "button",
        {
          type: "button",
          className: "btn-secondary schedule-expand-btn",
          onClick: function () {
            setExpanded(true);
          },
        },
        "Expand",
      ),
    ),
    el("div", { className: "schedule-option-planner" }, legendInline, gridInline),
    summary,
    modalPlanner,
  );
}

function parseHtmlTimeInput(str) {
  const p = String(str || "0:0").split(":");
  const h = parseInt(p[0], 10) || 0;
  const m = parseInt(p[1], 10) || 0;
  return h * 60 + m;
}

function addRecurringToCells(dayFlags, startHM, endHM, setCells) {
  const startMin = parseHtmlTimeInput(startHM);
  const endMin = parseHtmlTimeInput(endHM);
  if (endMin <= startMin) return;
  setCells(function (prev) {
    const next = new Set(prev);
    CAL_DAYS.forEach(function (_, dIdx) {
      const dayName = CAL_DAYS[dIdx];
      if (!dayFlags[dayName]) return;
      for (let t = startMin; t < endMin; t += SLOT_MINUTES) {
        if (t < GRID_START_HOUR * 60 || t >= GRID_END_HOUR * 60) continue;
        const slot = Math.floor((t - GRID_START_HOUR * 60) / SLOT_MINUTES);
        next.add(dIdx + "-" + slot);
      }
    });
    return next;
  });
}

const COURSE_CATALOG = buildCourseCatalogFromExcel(typeof REAL_DATA_SECTIONS !== "undefined" ? REAL_DATA_SECTIONS : []);

const COURSE_ID_TO_GROUP = {};
for (let i = 0; i < COURSE_CATALOG.length; i++) {
  const g = COURSE_CATALOG[i];
  for (let j = 0; j < g.courseIds.length; j++) {
    COURSE_ID_TO_GROUP[g.courseIds[j]] = g;
  }
}

function App() {
  const el = React.createElement;

  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [activeDept, setActiveDept] = useState("ALL");
  const [shortlist, setShortlist] = useState([]);
  const [blockedCells, setBlockedCells] = useState(new Set());
  const [targetCu, setTargetCu] = useState(5);
  const [recurringLabel, setRecurringLabel] = useState("");
  const [recurringDays, setRecurringDays] = useState({ Mon: true, Tue: false, Wed: true, Thu: false, Fri: false });
  const [recurringStart, setRecurringStart] = useState("16:00");
  const [recurringEnd, setRecurringEnd] = useState("18:00");
  const [dragSid, setDragSid] = useState(null);

  const shortlistedGroupKeys = useMemo(function () {
    return new Set(
      shortlist.map(function (s) {
        return s.courseGroup.groupKey;
      }),
    );
  }, [shortlist]);

  const visibleCourses = useMemo(function () {
    const q = query.trim().toLowerCase();
    return COURSE_CATALOG.filter(function (c) {
      const deptOk = activeDept === "ALL" || c.departments.indexOf(activeDept) !== -1;
      const textOk =
        !q ||
        c.displayCourseIds.toLowerCase().indexOf(q) !== -1 ||
        c.title.toLowerCase().indexOf(q) !== -1;
      return deptOk && textOk;
    });
  }, [query, activeDept]);

  const orderedShortlistForScheduler = useMemo(function () {
    return shortlist.slice();
  }, [shortlist]);

  const viableSchedules = useMemo(function () {
    if (page < 3) return [];
    return findViableSchedules(orderedShortlistForScheduler, blockedCells, targetCu, 3);
  }, [page, orderedShortlistForScheduler, blockedCells, targetCu]);

  const resultsSummaryMessage = useMemo(function () {
    if (page < 3) return "";
    if (viableSchedules.length > 0) {
      const hasHigh = orderedShortlistForScheduler.some(function (x) {
        return x.priority === "high";
      });
      const core =
        "We found " +
        viableSchedules.length +
        " schedule option" +
        (viableSchedules.length === 1 ? "" : "s") +
        " that ";
      const mid = hasHigh
        ? "include every high-priority course, "
        : "use your shortlist priorities, ";
      return (
        core +
        mid +
        "avoid time overlaps where quarters actually overlap (Q1 vs Q2 at the same clock is fine), and respect your blocked times."
      );
    }
    return explainScheduleFailure(orderedShortlistForScheduler, blockedCells, targetCu);
  }, [page, viableSchedules, orderedShortlistForScheduler, blockedCells, targetCu]);

  function addCourse(courseGroup) {
    if (shortlistedGroupKeys.has(courseGroup.groupKey)) return;
    setShortlist(function (prev) {
      return prev.concat([
        {
          courseGroup: courseGroup,
          priority: "medium",
          clientId: "sl-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10),
        },
      ]);
    });
  }

  function removeShortlist(clientId) {
    setShortlist(function (prev) {
      return prev.filter(function (x) {
        return x.clientId !== clientId;
      });
    });
  }

  function setPriority(clientId, p) {
    setShortlist(function (prev) {
      return prev.map(function (x) {
        return x.clientId === clientId ? Object.assign({}, x, { priority: p }) : x;
      });
    });
  }

  function onDragStart(item) {
    setDragSid(item.clientId);
  }
  function onDragOver(e, _item) {
    e.preventDefault();
  }
  function onDrop(targetItem) {
    const sid = dragSid;
    if (!sid || sid === targetItem.clientId) return;
    setShortlist(function (prev) {
      const idxDrag = prev.findIndex(function (x) {
        return x.clientId === sid;
      });
      const idxDrop = prev.findIndex(function (x) {
        return x.clientId === targetItem.clientId;
      });
      if (idxDrag < 0 || idxDrop < 0) return prev;
      const copy = prev.slice();
      const [removed] = copy.splice(idxDrag, 1);
      copy.splice(idxDrop, 0, removed);
      return copy;
    });
    setDragSid(null);
  }

  function applyRecurring() {
    if (!recurringLabel.trim()) return;
    addRecurringToCells(recurringDays, recurringStart, recurringEnd, setBlockedCells);
    setRecurringLabel("");
  }

  const deptButtons = [
    el(
      "button",
      {
        key: "ALL",
        className: "pill" + (activeDept === "ALL" ? " active" : ""),
        onClick: function () {
          setActiveDept("ALL");
        },
      },
      "ALL",
    ),
  ].concat(
    DEPARTMENTS.map(function (dept) {
      return el(
        "button",
        {
          key: dept,
          className: "pill" + (activeDept === dept ? " active" : ""),
          onClick: function () {
            setActiveDept(dept);
          },
        },
        dept,
      );
    }),
  );

  const cards = visibleCourses.map(function (courseGroup) {
    const inList = shortlistedGroupKeys.has(courseGroup.groupKey);
    const gapLabels = courseGroupFillsGapLabels(courseGroup);
    const quarters = {};
    courseGroup.sections.forEach(function (s) {
      quarters[s.quarter] = true;
    });
    const qStr = Object.keys(quarters).sort().join(", ");
    return el(
      "article",
      {
        key: courseGroup.groupKey,
        className: "card" + (inList ? " shortlisted" : ""),
        onClick: function () {
          addCourse(courseGroup);
        },
      },
      el(
        "div",
        { className: "card-head" },
        el("p", { className: "course-id" }, courseGroup.displayCourseIds),
        el("p", { className: "course-cu" }, courseGroup.cu + " CU · " + qStr),
      ),
      gapLabels.length
        ? el(
            "div",
            { className: "gap-badge-row" },
            gapLabels.map(function (g, gi) {
              return el("span", { key: g + "-" + gi, className: "gap-badge" }, "Fills: " + g);
            }),
          )
        : null,
      el("p", { className: "course-title" }, courseGroup.title),
      el(
        "p",
        { className: "course-meta" },
        (function () {
          const u = {};
          const times = [];
          courseGroup.sections.forEach(function (s) {
            const k = s.days + " " + s.time + " · " + s.quarter;
            if (!u[k]) {
              u[k] = true;
              times.push(k);
            }
          });
          const show = times.slice(0, 3).join(" · ");
          return times.length > 3 ? show + " (+" + (times.length - 3) + " more)" : show;
        })(),
      ),
      el(
        "p",
        { className: "course-meta" },
        (function () {
          const ins = courseGroup.sections.map(function (s) {
            return s.instructor;
          });
          const uniq = ins.filter(function (x, i, a) {
            return a.indexOf(x) === i;
          });
          const show = uniq.slice(0, 2).join(", ");
          return "Instructors: " + show + (uniq.length > 2 ? " +" + (uniq.length - 2) + " more" : "");
        })(),
      ),
    );
  });

  const shortlistPanel =
    shortlist.length === 0
      ? el("p", { className: "empty" }, "Click a course to add.")
      : shortlist.map(function (item) {
          const g = item.courseGroup;
          return el(
            "div",
            {
              key: item.clientId,
              className: "short-item drag-item",
              draggable: true,
              onDragStart: function (e) {
                try {
                  e.dataTransfer.setData("text/plain", String(item.clientId));
                } catch (err) {}
                e.dataTransfer.effectAllowed = "move";
                onDragStart(item);
              },
              onDragEnd: function () {
                setDragSid(null);
              },
              onDragOver: function (e) {
                onDragOver(e, item);
              },
              onDrop: function (e) {
                e.preventDefault();
                e.stopPropagation();
                onDrop(item);
              },
            },
            el("p", null, el("strong", null, g.displayCourseIds)),
            el("p", { className: "short-mini" }, g.title),
            el(
              "div",
              { className: "priority-row" },
              ["high", "medium", "low"].map(function (p) {
                return el(
                  "button",
                  {
                    key: p,
                    className: "pill small" + (item.priority === p ? " active" : ""),
                    type: "button",
                    onClick: function (e) {
                      e.stopPropagation();
                      setPriority(item.clientId, p);
                    },
                  },
                  p,
                );
              }),
            ),
            el(
              "button",
              {
                className: "remove-btn",
                onClick: function (e) {
                  e.stopPropagation();
                  removeShortlist(item.clientId);
                },
              },
              "Remove",
            ),
          );
        });

  if (page === 1) {
    return el(
      "div",
      { className: "app-shell" },
      WizardNav({ step: 1 }),
      el(
        "main",
        { className: "app app-three-col" },
        el(
          "section",
          { className: "panel left-panel wide" },
          el(
            "header",
            { className: "header" },
            el("h1", { className: "title" }, "CourseMatch Assist"),
            el("p", { className: "subtitle" }, "Plan your schedule, shortlist courses, and bid smarter."),
          ),
          el(
            "div",
            { className: "controls" },
            el("input", {
              className: "search",
              placeholder: "Search course name or ID...",
              value: query,
              onChange: function (e) {
                setQuery(e.target.value);
              },
            }),
            el("div", { className: "target-cu-row" },
              el("label", { className: "target-cu-label" }, "Target semester CU:"),
              el("input", {
                type: "number",
                className: "target-cu-input",
                step: "0.5",
                min: "0.5",
                max: "5.5",
                value: targetCu,
                onChange: function (e) {
                  setTargetCu(parseFloat(e.target.value) || 0);
                },
              }),
            ),
            el("div", { className: "controls-label" }, "Department"),
            el("div", { className: "button-row" }, deptButtons),
          ),
          el(
            "p",
            { className: "hint drag-hint" },
            "Shortlist: High = must be on your final schedule. Medium = add if time permits. Low = only if it helps hit CU without conflicts. Drag order breaks ties within each level.",
          ),
          el("section", { className: "cards" }, cards),
        ),
        el("aside", { className: "panel profile-aside" }, StudentProfilePanel({})),
        el(
          "aside",
          { className: "panel shortlist" },
          el("h2", { className: "shortlist-title" }, "Shortlist (" + shortlist.length + ")"),
          shortlistPanel,
          el(
            "div",
            { className: "page-actions" },
            el(
              "button",
              {
                className: "btn-primary",
                onClick: function () {
                  setPage(2);
                },
              },
              "Next → Availability",
            ),
          ),
        ),
      ),
    );
  }

  if (page === 2) {
    return el(
      "div",
      { className: "app-shell" },
      WizardNav({ step: 2 }),
      el(
        "main",
        { className: "page-availability" },
        el("h2", { className: "page-title" }, "Availability & constraints"),
        el("p", { className: "page-lead" }, "Mark times you cannot take class. Drag on the grid or use recurring blocks."),
        el(PagePickerCalendar, { blockedCells: blockedCells, setBlockedCells: setBlockedCells }),
        el(
          "div",
          { className: "recurring-panel panel" },
          el("h3", null, "Recurring commitment"),
          el(
            "div",
            { className: "recurring-row" },
            el("input", {
              className: "search",
              placeholder: "Name (e.g. Internship)",
              value: recurringLabel,
              onChange: function (e) {
                setRecurringLabel(e.target.value);
              },
            }),
            CAL_DAYS.map(function (d) {
              return el(
                "label",
                { key: d, className: "day-check" },
                el("input", {
                  type: "checkbox",
                  checked: !!recurringDays[d],
                  onChange: function (e) {
                    setRecurringDays(function (prev) {
                      const next = Object.assign({}, prev);
                      next[d] = e.target.checked;
                      return next;
                    });
                  },
                }),
                " " + d.slice(0, 3),
              );
            }),
            el("input", { type: "time", className: "time-input", value: recurringStart, onChange: function (e) { setRecurringStart(e.target.value); } }),
            el("span", null, "-"),
            el("input", { type: "time", className: "time-input", value: recurringEnd, onChange: function (e) { setRecurringEnd(e.target.value); } }),
            el("button", { className: "btn-secondary", onClick: applyRecurring }, "Add to grid"),
          ),
        ),
        el(
          "div",
          { className: "page-actions-inline" },
          el(
            "button",
            {
              className: "btn-secondary",
              onClick: function () {
                setPage(1);
              },
            },
            "← Back",
          ),
          el(
            "button",
            {
              className: "btn-primary",
              onClick: function () {
                setPage(3);
              },
            },
            "Next → Results",
          ),
        ),
      ),
    );
  }

  const scheduleOptions =
    viableSchedules.length === 0
      ? null
      : el(
          "div",
          { className: "schedule-compare" },
          viableSchedules.map(function (sol, idx) {
            const colorMap = buildSectionColorMap(sol.sections);
            const clearing = sol.sections.map(function (sec) {
              const cg = COURSE_ID_TO_GROUP[sec.courseId];
              const row = lookupClearingRow(cg);
              const ph = track4BiddingPlaceholder(cg, sec, row);
              return el(
                "li",
                { key: sec.sectionId },
                el("strong", null, cg.displayCourseIds),
                " - ",
                sec.sectionId,
                ": ",
                ph.estimatedBidRange,
                " · ",
                el("span", { className: "tier-" + ph.tier }, ph.tier),
              );
            });
            const summary = el(
              "div",
              { className: "schedule-summary" },
              el("p", { className: "schedule-total-cu" }, el("strong", null, "Total CU: "), sol.totalCu.toFixed(2)),
              el("h5", { className: "bidding-head" }, "Bidding guidance (mock clearing prices)"),
              el("ul", { className: "bidding-list" }, clearing),
            );
            return el(ScheduleOptionCard, {
              key: "opt-" + idx,
              sol: sol,
              optionIndex: idx,
              summary: summary,
              sectionColorMap: colorMap,
            });
          }),
        );

  return el(
    "div",
    { className: "app-shell app-shell--results-wide" },
    WizardNav({ step: 3 }),
    el(
      "main",
      { className: "page-results page-results--wide" },
      el("h2", { className: "page-title" }, "Schedule results"),
      el("p", { className: "page-lead results-summary-lead" }, resultsSummaryMessage),
      el(
        "div",
        { className: "panel results-section results-schedules-panel" },
        el(
          "h3",
          null,
          "Top schedule options (closest to " + targetCu + " CU: exact best, then e.g. 4.5 / 5.5)",
        ),
        scheduleOptions,
      ),
      el(
        "div",
        { className: "page-actions-inline" },
        el(
          "button",
          {
            className: "btn-secondary",
            onClick: function () {
              setPage(2);
            },
          },
          "← Back",
        ),
        el(
          "button",
          {
            className: "btn-secondary",
            onClick: function () {
              setPage(1);
            },
          },
          "Edit shortlist",
        ),
      ),
    ),
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root");

try {
  rootEl.textContent = "";
  var reactRoot = ReactDOM.createRoot(rootEl);
  window.__COURSE_MATCH_REACT_ROOT__ = reactRoot;
  reactRoot.render(React.createElement(App));
  window.__COURSE_MATCH_MOUNTED__ = true;
} catch (err) {
  console.error(err);
  rootEl.textContent = "Error: " + (err && err.message ? err.message : String(err));
}

