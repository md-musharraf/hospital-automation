"use strict";
/**
 * Canonical All-India Location Dataset & Shared Validation Utilities.
 * ---------------------------------------------------------------------------
 * Provides the single source of truth for all 28 Indian States, 8 Union
 * Territories, and ~750+ official districts.
 *
 * Consumed by:
 * - Frontend (`@careeai/shared`): Cascading dropdowns, dynamic active filters.
 * - Backend (`require('@careeai/shared')`): Location validation and normalization.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.INDIA_STATES = exports.INDIA_LOCATIONS = void 0;
exports.getAllStates = getAllStates;
exports.getDistrictsForState = getDistrictsForState;
exports.isValidState = isValidState;
exports.isValidDistrict = isValidDistrict;
exports.normalizeLocation = normalizeLocation;
exports.getActiveLocations = getActiveLocations;
exports.INDIA_LOCATIONS = {
    // ── 28 STATES ─────────────────────────────────────────────────────────────
    'Andhra Pradesh': {
        name: 'Andhra Pradesh',
        type: 'state',
        districts: [
            'Alluri Sitharama Raju',
            'Anakapalli',
            'Ananthapuramu',
            'Annamayya',
            'Bapatla',
            'Chittoor',
            'Dr. B.R. Ambedkar Konaseema',
            'East Godavari',
            'Eluru',
            'Guntur',
            'Kakinada',
            'Krishna',
            'Kurnool',
            'Nandyal',
            'NTR',
            'Palnadu',
            'Parvathipuram Manyam',
            'Prakasam',
            'Sri Potti Sriramulu Nellore',
            'Sri Sathya Sai',
            'Srikakulam',
            'Tirupati',
            'Visakhapatnam',
            'Vizianagaram',
            'West Godavari',
            'YSR Kadapa'
        ]
    },
    'Arunachal Pradesh': {
        name: 'Arunachal Pradesh',
        type: 'state',
        districts: [
            'Anjaw',
            'Changlang',
            'Dibang Valley',
            'East Kameng',
            'East Siang',
            'Itanagar Capital Complex',
            'Kamle',
            'Kra Daadi',
            'Kurung Kumey',
            'Lepa Rada',
            'Lohit',
            'Longding',
            'Lower Dibang Valley',
            'Lower Siang',
            'Lower Subansiri',
            'Namsai',
            'Pakke Kessang',
            'Papum Pare',
            'Shi Yomi',
            'Siang',
            'Tawang',
            'Tirap',
            'Upper Siang',
            'Upper Subansiri',
            'West Kameng',
            'West Siang'
        ]
    },
    'Assam': {
        name: 'Assam',
        type: 'state',
        districts: [
            'Bajali',
            'Baksa',
            'Barpeta',
            'Biswanath',
            'Bongaigaon',
            'Cachar',
            'Charaideo',
            'Chirang',
            'Darrang',
            'Dhemaji',
            'Dhubri',
            'Dibrugarh',
            'Dima Hasao',
            'Goalpara',
            'Golaghat',
            'Hailakandi',
            'Hojai',
            'Jorhat',
            'Kamrup',
            'Kamrup Metropolitan',
            'Karbi Anglong',
            'Karimganj',
            'Kokrajhar',
            'Lakhimpur',
            'Majuli',
            'Morigaon',
            'Nagaon',
            'Nalbari',
            'Sivasagar',
            'Sonitpur',
            'South Salmara-Mankachar',
            'Tamulpur',
            'Tinsukia',
            'Udalguri',
            'West Karbi Anglong'
        ]
    },
    'Bihar': {
        name: 'Bihar',
        type: 'state',
        districts: [
            'Araria',
            'Arwal',
            'Aurangabad',
            'Banka',
            'Begusarai',
            'Bhagalpur',
            'Bhojpur',
            'Buxar',
            'Darbhanga',
            'East Champaran',
            'Gaya',
            'Gopalganj',
            'Jamui',
            'Jehanabad',
            'Kaimur',
            'Katihar',
            'Khagaria',
            'Kishanganj',
            'Lakhisarai',
            'Madhepura',
            'Madhubani',
            'Munger',
            'Muzaffarpur',
            'Nalanda',
            'Nawada',
            'Patna',
            'Purnia',
            'Rohtas',
            'Saharsa',
            'Samastipur',
            'Saran',
            'Sheikhpura',
            'Sheohar',
            'Sitamarhi',
            'Siwan',
            'Supaul',
            'Vaishali',
            'West Champaran'
        ]
    },
    'Chhattisgarh': {
        name: 'Chhattisgarh',
        type: 'state',
        districts: [
            'Balod',
            'Baloda Bazar',
            'Balrampur-Ramanujganj',
            'Bastar',
            'Bemetara',
            'Bijapur',
            'Bilaspur',
            'Dantewada',
            'Dhamtari',
            'Durg',
            'Gariaband',
            'Gaurela-Pendra-Marwahi',
            'Janjgir-Champa',
            'Jashpur',
            'Kabirdham',
            'Kanker',
            'Khairagarh-Chhuikhadan-Gandai',
            'Kondagaon',
            'Korba',
            'Koriya',
            'Mahasamund',
            'Manendragarh-Chirmiri-Bharatpur',
            'Mohla-Manpur-Ambagarh Chowki',
            'Mungeli',
            'Narayanpur',
            'Raigarh',
            'Raipur',
            'Rajnandgaon',
            'Sakti',
            'Sarangarh-Bilaigarh',
            'Sukma',
            'Surajpur',
            'Surguja'
        ]
    },
    'Goa': {
        name: 'Goa',
        type: 'state',
        districts: [
            'North Goa',
            'South Goa'
        ]
    },
    'Gujarat': {
        name: 'Gujarat',
        type: 'state',
        districts: [
            'Ahmedabad',
            'Amreli',
            'Anand',
            'Aravalli',
            'Banaskantha',
            'Bharuch',
            'Bhavnagar',
            'Botad',
            'Chhota Udaipur',
            'Dahod',
            'Dang',
            'Devbhumi Dwarka',
            'Gandhinagar',
            'Gir Somnath',
            'Jamnagar',
            'Junagadh',
            'Kheda',
            'Kutch',
            'Mahisagar',
            'Mehsana',
            'Morbi',
            'Narmada',
            'Navsari',
            'Panchmahal',
            'Patan',
            'Porbandar',
            'Rajkot',
            'Sabarkantha',
            'Surat',
            'Surendranagar',
            'Tapi',
            'Vadodara',
            'Valsad'
        ]
    },
    'Haryana': {
        name: 'Haryana',
        type: 'state',
        districts: [
            'Ambala',
            'Bhiwani',
            'Charkhi Dadri',
            'Faridabad',
            'Fatehabad',
            'Gurugram',
            'Hisar',
            'Jhajjar',
            'Jind',
            'Kaithal',
            'Karnal',
            'Kurukshetra',
            'Mahendragarh',
            'Nuh',
            'Palwal',
            'Panchkula',
            'Panipat',
            'Rewari',
            'Rohtak',
            'Sirsa',
            'Sonipat',
            'Yamunanagar'
        ]
    },
    'Himachal Pradesh': {
        name: 'Himachal Pradesh',
        type: 'state',
        districts: [
            'Bilaspur',
            'Chamba',
            'Hamirpur',
            'Kangra',
            'Kinnaur',
            'Kullu',
            'Lahaul and Spiti',
            'Mandi',
            'Shimla',
            'Sirmaur',
            'Solan',
            'Una'
        ]
    },
    'Jharkhand': {
        name: 'Jharkhand',
        type: 'state',
        districts: [
            'Bokaro',
            'Chatra',
            'Deoghar',
            'Dhanbad',
            'Dumka',
            'East Singhbhum',
            'Garhwa',
            'Giridih',
            'Godda',
            'Gumla',
            'Hazaribagh',
            'Jamtara',
            'Khunti',
            'Koderma',
            'Latehar',
            'Lohardaga',
            'Pakur',
            'Palamu',
            'Ramgarh',
            'Ranchi',
            'Sahibganj',
            'Saraikela Kharsawan',
            'Simdega',
            'West Singhbhum'
        ]
    },
    'Karnataka': {
        name: 'Karnataka',
        type: 'state',
        districts: [
            'Bagalkote',
            'Ballari',
            'Belagavi',
            'Bengaluru Rural',
            'Bengaluru Urban',
            'Bidar',
            'Chamarajanagara',
            'Chikkaballapura',
            'Chikkamagaluru',
            'Chitradurga',
            'Dakshina Kannada',
            'Davanagere',
            'Dharwad',
            'Gadag',
            'Hassan',
            'Haveri',
            'Kalaburagi',
            'Kodagu',
            'Kolar',
            'Koppal',
            'Mandya',
            'Mysuru',
            'Raichur',
            'Ramanagara',
            'Shivamogga',
            'Tumakuru',
            'Udupi',
            'Uttara Kannada',
            'Vijayanagara',
            'Vijayapura',
            'Yadgir'
        ]
    },
    'Kerala': {
        name: 'Kerala',
        type: 'state',
        districts: [
            'Alappuzha',
            'Ernakulam',
            'Idukki',
            'Kannur',
            'Kasaragod',
            'Kollam',
            'Kottayam',
            'Kozhikode',
            'Malappuram',
            'Palakkad',
            'Pathanamthitta',
            'Thiruvananthapuram',
            'Thrissur',
            'Wayanad'
        ]
    },
    'Madhya Pradesh': {
        name: 'Madhya Pradesh',
        type: 'state',
        districts: [
            'Agar Malwa',
            'Alirajpur',
            'Anuppur',
            'Ashoknagar',
            'Balaghat',
            'Barwani',
            'Betul',
            'Bhind',
            'Bhopal',
            'Burhanpur',
            'Chhatarpur',
            'Chhindwara',
            'Damoh',
            'Datia',
            'Dewas',
            'Dhar',
            'Dindori',
            'Guna',
            'Gwalior',
            'Harda',
            'Indore',
            'Jabalpur',
            'Jhabua',
            'Katni',
            'Khandwa',
            'Khargone',
            'Maihar',
            'Mandla',
            'Mandsaur',
            'Mauganj',
            'Morena',
            'Narmadapuram',
            'Narsinghpur',
            'Neemuch',
            'Niwari',
            'Pandhurna',
            'Panna',
            'Raisen',
            'Rajgarh',
            'Ratlam',
            'Rewa',
            'Sagar',
            'Satna',
            'Sehore',
            'Seoni',
            'Shahdol',
            'Shajapur',
            'Sheopur',
            'Shivpuri',
            'Sidhi',
            'Singrauli',
            'Tikamgarh',
            'Ujjain',
            'Umaria',
            'Vidisha'
        ]
    },
    'Maharashtra': {
        name: 'Maharashtra',
        type: 'state',
        districts: [
            'Ahmednagar',
            'Akola',
            'Amravati',
            'Beed',
            'Bhandara',
            'Buldhana',
            'Chandrapur',
            'Chhatrapati Sambhajinagar',
            'Dharashiv',
            'Dhule',
            'Gadchiroli',
            'Gondia',
            'Hingoli',
            'Jalgaon',
            'Jalna',
            'Kolhapur',
            'Latur',
            'Mumbai City',
            'Mumbai Suburban',
            'Nagpur',
            'Nanded',
            'Nandurbar',
            'Nashik',
            'Palghar',
            'Parbhani',
            'Pune',
            'Raigad',
            'Ratnagiri',
            'Sangli',
            'Satara',
            'Sindhudurg',
            'Solapur',
            'Thane',
            'Wardha',
            'Washim',
            'Yavatmal'
        ]
    },
    'Manipur': {
        name: 'Manipur',
        type: 'state',
        districts: [
            'Bishnupur',
            'Chandel',
            'Churachandpur',
            'Imphal East',
            'Imphal West',
            'Jiribam',
            'Kakching',
            'Kamjong',
            'Kangpokpi',
            'Noney',
            'Pherzawl',
            'Senapati',
            'Tamenglong',
            'Tengnoupal',
            'Thoubal',
            'Ukhrul'
        ]
    },
    'Meghalaya': {
        name: 'Meghalaya',
        type: 'state',
        districts: [
            'East Garo Hills',
            'East Jaintia Hills',
            'East Khasi Hills',
            'Eastern West Khasi Hills',
            'North Garo Hills',
            'Ri Bhoi',
            'South Garo Hills',
            'South West Garo Hills',
            'South West Khasi Hills',
            'West Garo Hills',
            'West Jaintia Hills',
            'West Khasi Hills'
        ]
    },
    'Mizoram': {
        name: 'Mizoram',
        type: 'state',
        districts: [
            'Aizawl',
            'Champhai',
            'Hnahthial',
            'Khawzawl',
            'Kolasib',
            'Lawngtlai',
            'Lunglei',
            'Mamit',
            'Saiha',
            'Saitual',
            'Serchhip'
        ]
    },
    'Nagaland': {
        name: 'Nagaland',
        type: 'state',
        districts: [
            'Chümoukedima',
            'Dimapur',
            'Kiphire',
            'Kohima',
            'Longleng',
            'Mokokchung',
            'Mon',
            'Niuland',
            'Noklak',
            'Peren',
            'Phek',
            'Shamator',
            'Tseminyu',
            'Tuensang',
            'Wokha',
            'Zunheboto'
        ]
    },
    'Odisha': {
        name: 'Odisha',
        type: 'state',
        districts: [
            'Angul',
            'Balangir',
            'Balasore',
            'Bargarh',
            'Bhadrak',
            'Boudh',
            'Cuttack',
            'Deogarh',
            'Dhenkanal',
            'Gajapati',
            'Ganjam',
            'Jagatsinghpur',
            'Jajpur',
            'Jharsuguda',
            'Kalahandi',
            'Kandhamal',
            'Kendrapara',
            'Kendujhar',
            'Khordha',
            'Koraput',
            'Malkangiri',
            'Mayurbhanj',
            'Nabarangpur',
            'Nayagarh',
            'Nuapada',
            'Puri',
            'Rayagada',
            'Sambalpur',
            'Subarnapur',
            'Sundargarh'
        ]
    },
    'Punjab': {
        name: 'Punjab',
        type: 'state',
        districts: [
            'Amritsar',
            'Barnala',
            'Bathinda',
            'Faridkot',
            'Fatehgarh Sahib',
            'Fazilka',
            'Ferozepur',
            'Gurdaspur',
            'Hoshiarpur',
            'Jalandhar',
            'Kapurthala',
            'Ludhiana',
            'Malerkotla',
            'Mansa',
            'Moga',
            'Pathankot',
            'Patiala',
            'Rupnagar',
            'Sahibzada Ajit Singh Nagar',
            'Sangrur',
            'Shahid Bhagat Singh Nagar',
            'Sri Muktsar Sahib',
            'Tarn Taran'
        ]
    },
    'Rajasthan': {
        name: 'Rajasthan',
        type: 'state',
        districts: [
            'Ajmer',
            'Alwar',
            'Anupgarh',
            'Balotra',
            'Banswara',
            'Baran',
            'Barmer',
            'Beawar',
            'Bharatpur',
            'Bhilwara',
            'Bikaner',
            'Bundi',
            'Chittorgarh',
            'Churu',
            'Dausa',
            'Deeg',
            'Dholpur',
            'Didwana-Kuchaman',
            'Dudu',
            'Dungarpur',
            'Gangapur City',
            'Hanumangarh',
            'Jaipur',
            'Jaipur Rural',
            'Jaisalmer',
            'Jalore',
            'Jhalawar',
            'Jhunjhunu',
            'Jodhpur',
            'Jodhpur Rural',
            'Karauli',
            'Kekri',
            'Khairthal-Tijara',
            'Kota',
            'Kotputli-Behror',
            'Nagaur',
            'Neem Ka Thana',
            'Pali',
            'Phalodi',
            'Pratapgarh',
            'Rajsamand',
            'Salumber',
            'Sanchore',
            'Sawai Madhopur',
            'Shahpura',
            'Sikar',
            'Sirohi',
            'Sri Ganganagar',
            'Tonk',
            'Udaipur'
        ]
    },
    'Sikkim': {
        name: 'Sikkim',
        type: 'state',
        districts: [
            'Gangtok',
            'Gyalshing',
            'Mangan',
            'Namchi',
            'Pakyong',
            'Soreng'
        ]
    },
    'Tamil Nadu': {
        name: 'Tamil Nadu',
        type: 'state',
        districts: [
            'Ariyalur',
            'Chengalpattu',
            'Chennai',
            'Coimbatore',
            'Cuddalore',
            'Dharmapuri',
            'Dindigul',
            'Erode',
            'Kallakurichi',
            'Kanchipuram',
            'Kanyakumari',
            'Karur',
            'Krishnagiri',
            'Madurai',
            'Mayiladuthurai',
            'Nagapattinam',
            'Namakkal',
            'Nilgiris',
            'Perambalur',
            'Pudukkottai',
            'Ramanathapuram',
            'Ranipet',
            'Salem',
            'Sivaganga',
            'Tenkasi',
            'Thanjavur',
            'Theni',
            'Thoothukudi',
            'Tiruchirappalli',
            'Tirunelveli',
            'Tirupathur',
            'Tiruppur',
            'Tiruvallur',
            'Tiruvannamalai',
            'Tiruvarur',
            'Vellore',
            'Viluppuram',
            'Virudhunagar'
        ]
    },
    'Telangana': {
        name: 'Telangana',
        type: 'state',
        districts: [
            'Adilabad',
            'Bhadradri Kothagudem',
            'Hanumakonda',
            'Hyderabad',
            'Jagtial',
            'Jangaon',
            'Jayashankar Bhupalpally',
            'Jogulamba Gadwal',
            'Kamareddy',
            'Karimnagar',
            'Khammam',
            'Kumuram Bheem Asifabad',
            'Mahabubabad',
            'Mahabubnagar',
            'Mancherial',
            'Medak',
            'Medchal-Malkajgiri',
            'Mulugu',
            'Nagarkurnool',
            'Nalgonda',
            'Narayanpet',
            'Nirmal',
            'Nizamabad',
            'Peddapalli',
            'Rajanna Sircilla',
            'Ranga Reddy',
            'Sangareddy',
            'Siddipet',
            'Suryapet',
            'Vikarabad',
            'Wanaparthy',
            'Warangal',
            'Yadadri Bhuvanagiri'
        ]
    },
    'Tripura': {
        name: 'Tripura',
        type: 'state',
        districts: [
            'Dhalai',
            'Gomati',
            'Khowai',
            'North Tripura',
            'Sepahijala',
            'South Tripura',
            'Unakoti',
            'West Tripura'
        ]
    },
    'Uttar Pradesh': {
        name: 'Uttar Pradesh',
        type: 'state',
        districts: [
            'Agra',
            'Aligarh',
            'Ambedkar Nagar',
            'Amethi',
            'Amroha',
            'Auraiya',
            'Ayodhya',
            'Azamgarh',
            'Baghpat',
            'Bahraich',
            'Ballia',
            'Balrampur',
            'Banda',
            'Barabanki',
            'Bareilly',
            'Basti',
            'Bhadohi',
            'Bijnor',
            'Budaun',
            'Bulandshahr',
            'Chandauli',
            'Chitrakoot',
            'Deoria',
            'Etah',
            'Etawah',
            'Farrukhabad',
            'Fatehpur',
            'Firozabad',
            'Gautam Buddha Nagar',
            'Ghaziabad',
            'Ghazipur',
            'Gonda',
            'Gorakhpur',
            'Hamirpur',
            'Hapur',
            'Hardoi',
            'Hathras',
            'Jalaun',
            'Jaunpur',
            'Jhansi',
            'Kannauj',
            'Kanpur Dehat',
            'Kanpur Nagar',
            'Kasganj',
            'Kaushambi',
            'Kheri',
            'Kushinagar',
            'Lalitpur',
            'Lucknow',
            'Maharajganj',
            'Mahoba',
            'Mainpuri',
            'Mathura',
            'Mau',
            'Meerut',
            'Mirzapur',
            'Moradabad',
            'Muzaffarnagar',
            'Pilibhit',
            'Pratapgarh',
            'Prayagraj',
            'Raebareli',
            'Rampur',
            'Saharanpur',
            'Sambhal',
            'Sant Kabir Nagar',
            'Shahjahanpur',
            'Shamli',
            'Shravasti',
            'Siddharthnagar',
            'Sitapur',
            'Sonbhadra',
            'Sultanpur',
            'Unnao',
            'Varanasi'
        ]
    },
    'Uttarakhand': {
        name: 'Uttarakhand',
        type: 'state',
        districts: [
            'Almora',
            'Bageshwar',
            'Chamoli',
            'Champawat',
            'Dehradun',
            'Haridwar',
            'Nainital',
            'Pauri Garhwal',
            'Pithoragarh',
            'Rudraprayag',
            'Tehri Garhwal',
            'Udham Singh Nagar',
            'Uttarkashi'
        ]
    },
    'West Bengal': {
        name: 'West Bengal',
        type: 'state',
        districts: [
            'Alipurduar',
            'Bankura',
            'Birbhum',
            'Cooch Behar',
            'Dakshin Dinajpur',
            'Darjeeling',
            'Hooghly',
            'Howrah',
            'Jalpaiguri',
            'Jhargram',
            'Kalimpong',
            'Kolkata',
            'Malda',
            'Murshidabad',
            'Nadia',
            'North 24 Parganas',
            'Paschim Bardhaman',
            'Paschim Medinipur',
            'Purba Bardhaman',
            'Purba Medinipur',
            'Purulia',
            'South 24 Parganas',
            'Uttar Dinajpur'
        ]
    },
    // ── 8 UNION TERRITORIES ───────────────────────────────────────────────────
    'Andaman and Nicobar Islands': {
        name: 'Andaman and Nicobar Islands',
        type: 'ut',
        districts: [
            'Nicobar',
            'North and Middle Andaman',
            'South Andaman'
        ]
    },
    'Chandigarh': {
        name: 'Chandigarh',
        type: 'ut',
        districts: [
            'Chandigarh'
        ]
    },
    'Dadra and Nagar Haveli and Daman and Diu': {
        name: 'Dadra and Nagar Haveli and Daman and Diu',
        type: 'ut',
        districts: [
            'Dadra and Nagar Haveli',
            'Daman',
            'Diu'
        ]
    },
    'Delhi': {
        name: 'Delhi',
        type: 'ut',
        districts: [
            'Central Delhi',
            'East Delhi',
            'New Delhi',
            'North Delhi',
            'North East Delhi',
            'North West Delhi',
            'Shahdara',
            'South Delhi',
            'South East Delhi',
            'South West Delhi',
            'West Delhi'
        ]
    },
    'Jammu and Kashmir': {
        name: 'Jammu and Kashmir',
        type: 'ut',
        districts: [
            'Anantnag',
            'Bandipora',
            'Baramulla',
            'Budgam',
            'Doda',
            'Ganderbal',
            'Jammu',
            'Kathua',
            'Kishtwar',
            'Kulgam',
            'Kupwara',
            'Poonch',
            'Pulwama',
            'Rajouri',
            'Ramban',
            'Reasi',
            'Samba',
            'Shopian',
            'Srinagar',
            'Udhampur'
        ]
    },
    'Ladakh': {
        name: 'Ladakh',
        type: 'ut',
        districts: [
            'Kargil',
            'Leh'
        ]
    },
    'Lakshadweep': {
        name: 'Lakshadweep',
        type: 'ut',
        districts: [
            'Lakshadweep'
        ]
    },
    'Puducherry': {
        name: 'Puducherry',
        type: 'ut',
        districts: [
            'Karaikal',
            'Mahe',
            'Puducherry',
            'Yanam'
        ]
    }
};
/**
 * Pre-sorted list of all 36 Indian States and Union Territories.
 */
exports.INDIA_STATES = Object.freeze(Object.keys(exports.INDIA_LOCATIONS).sort((a, b) => a.localeCompare(b)));
/**
 * Internal lowercase lookup maps for fast, case-insensitive resolution.
 */
const STATE_LOOKUP = new Map();
const DISTRICT_LOOKUP = new Map();
for (const [stateName, info] of Object.entries(exports.INDIA_LOCATIONS)) {
    STATE_LOOKUP.set(stateName.toLowerCase(), stateName);
    const districtMap = new Map();
    for (const d of info.districts) {
        districtMap.set(d.toLowerCase(), d);
    }
    DISTRICT_LOOKUP.set(stateName.toLowerCase(), districtMap);
}
/**
 * Returns all 36 Indian States and Union Territories in alphabetical order.
 */
function getAllStates() {
    return [...exports.INDIA_STATES];
}
/**
 * Find canonical state name case-insensitively.
 */
function findCanonicalState(rawState) {
    if (typeof rawState !== 'string')
        return null;
    const cleaned = rawState.trim().toLowerCase();
    if (!cleaned)
        return null;
    return STATE_LOOKUP.get(cleaned) ?? null;
}
/**
 * Returns all official districts for a given state or Union Territory.
 * Performs case-insensitive matching on state name.
 * Returns empty array if state is invalid, empty, or unknown.
 */
function getDistrictsForState(state) {
    if (!state || typeof state !== 'string')
        return [];
    const canonicalState = findCanonicalState(state);
    if (!canonicalState)
        return [];
    const info = exports.INDIA_LOCATIONS[canonicalState];
    if (!info)
        return [];
    return [...info.districts].sort((a, b) => a.localeCompare(b));
}
/**
 * Validates if the given string matches any of the 28 States or 8 UTs (case-insensitive).
 */
function isValidState(state) {
    return Boolean(findCanonicalState(state));
}
/**
 * Validates if the given district belongs to the specified state (case-insensitive).
 */
function isValidDistrict(state, district) {
    if (!state || !district || typeof state !== 'string' || typeof district !== 'string') {
        return false;
    }
    const canonicalState = findCanonicalState(state);
    if (!canonicalState)
        return false;
    const districtMap = DISTRICT_LOOKUP.get(canonicalState.toLowerCase());
    if (!districtMap)
        return false;
    const cleanDistrict = district.trim().toLowerCase();
    return districtMap.has(cleanDistrict);
}
/**
 * Normalizes state and district names to their official canonical casing.
 * If unrecognized, returns trimmed raw values.
 */
function normalizeLocation(state, district) {
    const cleanState = (state ?? '').trim();
    const cleanDistrict = (district ?? '').trim();
    const canonicalState = findCanonicalState(cleanState);
    if (!canonicalState) {
        return { state: cleanState, district: cleanDistrict };
    }
    const districtMap = DISTRICT_LOOKUP.get(canonicalState.toLowerCase());
    const canonicalDistrict = districtMap?.get(cleanDistrict.toLowerCase()) ?? cleanDistrict;
    return {
        state: canonicalState,
        district: canonicalDistrict
    };
}
/**
 * Aggregates active states and districts with facility counts from a list of hospitals.
 * Only includes states and districts that have >= 1 facility registered.
 */
function getActiveLocations(hospitals) {
    const stateCounts = new Map();
    const districtCountsByState = new Map();
    for (const h of hospitals || []) {
        const rawState = (h.state || '').trim();
        const rawDistrict = (h.district || '').trim();
        const rawCity = (h.city || '').trim();
        // Use state or fallback to city if state is missing
        const candidateState = rawState || rawCity;
        if (!candidateState)
            continue;
        const normalized = normalizeLocation(candidateState, rawDistrict || rawCity);
        const resolvedState = normalized.state;
        const resolvedDistrict = normalized.district;
        if (!resolvedState)
            continue;
        stateCounts.set(resolvedState, (stateCounts.get(resolvedState) ?? 0) + 1);
        if (resolvedDistrict) {
            if (!districtCountsByState.has(resolvedState)) {
                districtCountsByState.set(resolvedState, new Map());
            }
            const distMap = districtCountsByState.get(resolvedState);
            distMap.set(resolvedDistrict, (distMap.get(resolvedDistrict) ?? 0) + 1);
        }
    }
    const states = Array.from(stateCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name));
    const districts = {};
    for (const [stateName, distMap] of districtCountsByState.entries()) {
        districts[stateName] = Array.from(distMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    return { states, districts };
}
//# sourceMappingURL=locations.js.map